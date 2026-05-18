const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();

const server = http.createServer(app);

const io = new Server(server,{
  cors:{
    origin:"*"
  }
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err));

/* =========================
   DATABASE SCHEMAS
========================= */

const userSchema = new mongoose.Schema({

  name:String,

  email:String,

  password:String,

  streak:{
    type:Number,
    default:1
  }

});

const taskSchema = new mongoose.Schema({

  userId:String,

  task:String,

  priority:String,

  category:String,

  deadline:String,

  completed:{
    type:Boolean,
    default:false
  },

  createdAt:{
    type:Date,
    default:Date.now
  }

});

const habitSchema = new mongoose.Schema({

  userId:String,

  water:Number,

  study:Number,

  sleep:Number,

  exercise:Number

});

const User = mongoose.model("User",userSchema);

const Task = mongoose.model("Task",taskSchema);

const Habit = mongoose.model("Habit",habitSchema);

/* =========================
   AUTH MIDDLEWARE
========================= */

function auth(req,res,next){

  const token=req.headers.authorization;

  if(!token){

    return res.status(401).json({
      message:"No Token Found"
    });

  }

  try{

    const verified=jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user=verified;

    next();

  }catch{

    res.status(401).json({
      message:"Invalid Token"
    });

  }

}

/* =========================
   HOME ROUTE
========================= */

app.get("/",(req,res)=>{

  res.send("🚀 SmartLife Sync Ultimate Running");

});

/* =========================
   REGISTER
========================= */

app.post("/register",async(req,res)=>{

  try{

    const {
      name,
      email,
      password
    }=req.body;

    const existing=await User.findOne({
      email
    });

    if(existing){

      return res.json({
        message:"User Already Exists"
      });

    }

    const hashed=await bcrypt.hash(
      password,
      10
    );

    const user=new User({

      name,

      email,

      password:hashed

    });

    await user.save();

    res.json({
      message:"✅ Registration Successful"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Registration Failed"
    });

  }

});

/* =========================
   LOGIN
========================= */

app.post("/login",async(req,res)=>{

  try{

    const {
      email,
      password
    }=req.body;

    const user=await User.findOne({
      email
    });

    if(!user){

      return res.json({
        message:"User Not Found"
      });

    }

    const valid=await bcrypt.compare(
      password,
      user.password
    );

    if(!valid){

      return res.json({
        message:"Wrong Password"
      });

    }

    const token=jwt.sign(
      {id:user._id},
      process.env.JWT_SECRET
    );

    res.json({

      token,

      name:user.name,

      streak:user.streak

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Login Failed"
    });

  }

});

/* =========================
   ADD TASK
========================= */

app.post("/add-task",auth,async(req,res)=>{

  try{

    const {

      task,

      priority,

      category,

      deadline

    }=req.body;

    const newTask=new Task({

      userId:req.user.id,

      task,

      priority,

      category,

      deadline

    });

    await newTask.save();

    io.emit("task-added",newTask);

    res.json(newTask);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Task Failed"
    });

  }

});

/* =========================
   GET TASKS
========================= */

app.get("/tasks",auth,async(req,res)=>{

  try{

    const tasks=await Task.find({

      userId:req.user.id

    });

    res.json(tasks);

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Cannot Fetch Tasks"
    });

  }

});

/* =========================
   COMPLETE TASK
========================= */

app.put("/complete/:id",auth,async(req,res)=>{

  try{

    await Task.findByIdAndUpdate(

      req.params.id,

      {
        completed:true
      }

    );

    res.json({
      message:"✅ Task Completed"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Complete Failed"
    });

  }

});

/* =========================
   DELETE TASK
========================= */

app.delete("/delete/:id",auth,async(req,res)=>{

  try{

    await Task.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message:"🗑 Task Deleted"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Delete Failed"
    });

  }

});

/* =========================
   DASHBOARD
========================= */

app.get("/dashboard",auth,async(req,res)=>{

  try{

    const tasks=await Task.find({

      userId:req.user.id

    });

    const total=tasks.length;

    const completed=tasks.filter(
      task=>task.completed
    ).length;

    const pending=total-completed;

    const productivity=
    total===0
    ?0
    :Math.round(
      (completed/total)*100
    );

    res.json({

      total,

      completed,

      pending,

      productivity

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Dashboard Failed"
    });

  }

});

/* =========================
   HABIT TRACKER
========================= */

app.post("/habit",auth,async(req,res)=>{

  try{

    const {

      water,

      study,

      sleep,

      exercise

    }=req.body;

    const habit=new Habit({

      userId:req.user.id,

      water,

      study,

      sleep,

      exercise

    });

    await habit.save();

    res.json({
      message:"✅ Habits Saved"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Habit Failed"
    });

  }

});

/* =========================
   WEATHER API
========================= */

app.get("/weather/:city",async(req,res)=>{

  try{

    const city=req.params.city;

    const weather=await axios.get(

`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`

    );

    res.json(weather.data);

  }catch(err){

    console.log(err.response?.data || err.message);

    res.status(500).json({
      message:"Weather Error"
    });

  }

});

/* =========================
   SOCKET.IO
========================= */

io.on("connection",(socket)=>{

  console.log("🟢 User Connected");

  socket.on("disconnect",()=>{

    console.log("🔴 User Disconnected");

  });

});

/* =========================
   START SERVER
========================= */

const PORT=process.env.PORT || 5002;

server.listen(PORT,()=>{

  console.log(`🚀 Server Running On ${PORT}`);

});