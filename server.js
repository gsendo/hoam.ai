import express from 'express';
import multer from 'multer';
import cors from 'cors';
import mongoose from 'mongoose';
import http from 'http';
import { Server } from 'socket.io';
import AWS from 'aws-sdk';
import multerS3 from 'multer-s3';
import path from 'path';
import fs from 'fs';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Increase body size limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS
app.use(cors());

// Static files
app.use(express.static('public'));

// MongoDB
mongoose.connect('mongodb+srv://hoamuser:test@cluster0.48rowfg.mongodb.net/hoam?retryWrites=true&w=majority&appName=Cluster0')
.then(() => console.log('Connected to MongoDB Atlas!'))
.catch(err => console.error('MongoDB connection error:', err));

// AWS S3 config
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,   // ← These must be set in your environment (.env or Vercel dashboard)
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Multer + S3 storage setup
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'public-read', // So files are public by default; adjust if needed
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            cb(null, Date.now().toString() + '-' + file.originalname);
        }
    }),
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

// Upload endpoint
app.post('/upload', upload.single('document'), (req, res) => {
    console.log('Uploaded to S3:', req.file.location);  // log file URL
    res.send({ url: req.file.location });
});

// List files endpoint
app.get('/api/files', async (req, res) => {
    try {
        const data = await s3.listObjectsV2({
            Bucket: process.env.AWS_BUCKET_NAME
        }).promise();

        const files = data.Contents.map(file => ({
            filename: file.Key,
            url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`
        }));

        res.json(files);
    } catch (err) {
        console.error('Failed to list files:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Register
app.post('/register', async (req, res) => {
    const { name, email, address, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('User already exists.');
        }

        const newUser = new User({ name, email, address, password });
        await newUser.save();

        console.log('New User Saved:', email);
        res.send('Success');
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Registration failed.');
    }
});

// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found.');
        if (user.password !== password) return res.status(400).send('Incorrect password.');

        res.send('Success');
    } catch (error) {
        console.error(error);
        res.status(500).send('Login failed.');
    }
});

// Chat
io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
