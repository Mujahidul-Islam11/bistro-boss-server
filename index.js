const express = require("express");
const app = express();
var jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.SECRET_KEY);
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.u8ojnwq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const bistroMenu = client.db("BistroBoss").collection("menu");
    const cartsData = client.db("BistroBoss").collection("carts");
    const usersData = client.db("BistroBoss").collection("users");
    const paymentData = client.db("BistroBoss").collection("payment");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next)=>{
      console.log('token', req.headers.authorization)
      if(!req.headers.authorization){
        return res.status(401).send({message: 'forbidden access'})
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded)=>{
        if(err){
          return res.status(401).send({message: 'forbidden access'})
        }
        req.decoded = decoded
        next()
      })
    }
    const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = {email: email}
      const user = await usersData.findOne(query)
      const isAdmin = user?.role === 'Admin' 
      if(!isAdmin){
        res.status(403).send({message:'Forbidden Access'})
      }
      next()
    }

    app.get("/users", verifyToken,verifyAdmin, async (req, res) => {
      console.log(req.headers);
      const result = await usersData.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email",verifyToken, async(req, res)=>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        res.status(403).send({message: 'Forbidden Access'})
      }
      const query = {email : email}
      const user = await usersData.findOne(query)
      let isAdmin = false 
      if(user){
        isAdmin = user?.role === 'Admin' 
      }
      res.send({isAdmin})

    })

    app.get("/menu", async (req, res) => {
      const result = await bistroMenu.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query  = {_id : new ObjectId(id)}
      const result = await bistroMenu.find(query).toArray();
      res.send(result);
    });

    app.patch("/menu/:id",verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body
      const id = req.params.id;
      const query  = {_id : new ObjectId(id)}
      const updatedDoc = {
        $set:{
          name: data.name,
            category: data.category,
            recipe: data.recipe,
            price: data.price,
            image: data.display_url,
        }
      }
      const result = await bistroMenu.updateOne(query, updatedDoc)
      res.send(result);
    });

    app.post('/payments', async(req , res)=>{
      const payment = req.body
      const result =await paymentData.insertOne(payment)
      const query = {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }}
      const deletedIds = await cartsData.deleteMany(query)
      res.send(result, deletedIds)
    })

    app.delete("/menu/:id",verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query  = {_id : new ObjectId(id)}
      const result = await bistroMenu.deleteOne(query)
      res.send(result);
    });
    
    app.post("/menu",verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body
      const result = await bistroMenu.insertOne(item)
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cursor = req.body;
      const result = await cartsData.insertOne(cursor);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersData.findOne(query);
      if (existingUser) {
        return res.send({
          message: "This user is already there in the database",
          insertedId: null,
        });
      }
      const result = await usersData.insertOne(user);
      res.send(result);
    });

    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const amount = parseInt(price*100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartsData.find(query).toArray();
      res.send(result);
    });
    
    app.patch("/users/admin/:id", verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await usersData.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/users/:id", verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersData.deleteOne(query);
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsData.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("boss is runnig in speed");
});

app.listen(port, () => {
  console.log(`boss is running in speed on port ${port}`);
});
