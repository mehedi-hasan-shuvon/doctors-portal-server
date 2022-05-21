const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

//doctor_admin
const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0-shard-00-00.kc2i6.mongodb.net:27017,cluster0-shard-00-01.kc2i6.mongodb.net:27017,cluster0-shard-00-02.kc2i6.mongodb.net:27017/myFirstDatabase?ssl=true&replicaSet=atlas-72lrsk-shard-0&authSource=admin&retryWrites=true&w=majority`;

// console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


//middle tier function for jwt token
function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        // console.log('Database connected');
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');


        //handel and update social users
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        });

        //get all users
        app.get('/users', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        //make user admin
        //handel and update social users
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });



        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            //step 1: get all services
            const services = await servicesCollection.find().toArray();

            //step 2: get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            //step 3: for each service, find bookings for that services
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                service.slots = available;

                // service.booked = booked;
                // service.booked = serviceBooking.map(s => s.slot);
            });


            res.send(services);
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            // const authorization = req.headers.authorization;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                // console.log('auth header', authorization);
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            } else {
                return res.status(403).send({ message: 'Forbidden access' });
            }

        })

        //add new element in booking
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);

            if (exists) {
                return res.send({ success: false, booking: exists })
            }

            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })




        /** 
         * APi naming convention
         * app.get('/booking') //get all booking in this collection or get more than one or by filter query
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.post('/booking/:id') //update a single booking
         * app.put('/booking/:id') //update(if exist) or insert(upsert) a single booking
         * app.delete('/booking/:id') // delete one booking.
        */



    }
    finally {

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctor uncle')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})