// app.js (Final Fixed Version)

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");

const cForm = require("./models/cForm.js");
const Customer = require("./models/Customer.js");
const Tailor = require("./models/Tailor.js");
const Order = require("./models/Order.js");

const MONGOURL = "mongodb://127.0.0.1:27017/naap-jhok";

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "/public")));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use(async (req, res, next) => {
    if (req.session && req.session.customerId) {
        const customer = await Customer.findById(req.session.customerId);
        if (customer) {
            res.locals.customerName = customer.name;
            res.locals.customerId = customer._id;
        }
    }
    next();
});

function isAuthenticated(req, res, next) {
    if (req.session.customerId) return next();
    res.redirect("/login/customer");
}

mongoose.connect(MONGOURL)
    .then(() => {
        console.log("MongoDB is connected");
        app.listen(8080, () => console.log("Server running on port 8080"));
    })
    .catch(err => console.error("MongoDB connection error:", err));


    app.get('/', async (req, res) => {
        res.render('listings/index.ejs', {
            customerName: req.session.customerName || null
        });
    });
    

app.get("/login/customer", (req, res) => {
    res.render("listings/customerLogin");
});

app.post('/login/customer', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const customer = await Customer.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
        if (customer && customer.password === password) {
            req.session.customerId = customer._id;
            req.session.customerName = customer.name;

            // Fetch orders from MongoDB
            const orders = await Order.find({ customerId: customer._id });

            return res.render('listings/dashboard.ejs', {
                customerName: customer.name,
                customerId: customer._id,
                orders: orders || []
            });
        } else {
            return res.render('listings/login.ejs', { error: 'Invalid credentials.' });
        }
    } catch (err) {
        console.error(err);
        return res.render('listings/login.ejs', { error: 'An error occurred. Please try again.' });
    }
});

app.use((req, res, next) => {
    res.locals.customerName = req.session.customerName || null;
    res.locals.customerId = req.session.customerId || null;
    next();
});


app.get("/register", (req, res) => res.render("listings/register"));

app.post("/register", async (req, res) => {
    const { email, phone, password } = req.body;
    const existingUser = await Customer.findOne({ email });
    if (existingUser) return res.status(400).send("User already exists");
    await new Customer({ email, phone, password }).save();
    res.redirect("/login/customer");
});

app.get("/login/tailor", (req, res) => res.render("listings/tailorLogin"));
app.get("/become-tailor", (req, res) => res.render("listings/becometailor"));

app.post("/become-tailor", async (req, res) => {
    await new Tailor(req.body).save();
    res.send("Tailor application submitted!");
});

app.get("/tailor/dashboard", async (req, res) => {
    const customerForms = await Order.find({});
    res.render("listings/tDashboard", { customerForms });
});

app.get("/services/mens", (req, res) => res.render("listings/menItems"));
app.get("/services/womens", (req, res) => res.render("listings/womenitems"));

app.get("/customize", (req, res) => {
    const { item, productName, image } = req.query;
    res.render("listings/customize", { item, productName, image });
});

app.post("/submit-measurements", async (req, res) => {
    const { item, productName, image, ...manualMeasurements } = req.body;
    try {
        await new Order({
            customerId: req.session.customerId,
            productName,
            itemType: item,
            image,
            manualMeasurements,
            usedAI: false
        }).save();
        res.send("Manual measurements submitted!");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving manual measurements.");
    }
});

const upload = multer({ dest: "uploads/" });

app.post("/capture", upload.single("aiImage"), async (req, res) => {
    const { item, productName } = req.body;

    if (!req.session.customerId) {
        return res.status(401).send("Unauthorized: Customer not logged in.");
    }

    try {
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        const response = await axios.post("http://127.0.0.1:5000/measure", {
            image_data: base64Image
        });

        const measurements = response.data.measurements;

        const newOrder = new Order({
            customerId: req.session.customerId,
            productName,
            itemType: item,
            image: req.file.filename,
            aiMeasurements: measurements,
            usedAI: true
        });

        await newOrder.save();

        // ✅ Render a results page with the measurements
        res.render("listings/aiResult", { productName, measurements });

    } catch (err) {
        console.error("AI prediction error:", err);
        res.status(500).send("AI measurement failed.");
    }
});



app.get("/place-order", (req, res) => res.render("listings/orderform", { orders: [] }));

app.post("/place-order", async (req, res) => {
    await new Order({ ...req.body, date: new Date() }).save();
    res.redirect("/place-order");
});

app.get("/my-orders", isAuthenticated, async (req, res) => {
    const orders = await Order.find({ customerId: req.session.customerId });
    res.render("listings/myOrders", { orders });
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Logout error:", err);
        res.redirect("/");
    });
});

app.get('/customize/:item', (req, res) => {
    const { item } = req.params;
    let productName, image;

    switch (item) {
        case 'pants': productName = 'Pants'; image = 'womenPant.jpeg'; break;
        case 'skirts': productName = 'Skirts'; image = 'womenSkirt.jpeg'; break;
        case 'shirts': productName = 'Shirts'; image = 'womenShirt.jpeg'; break;
        case 'suits': productName = 'Suits'; image = 'womenSuits.jpg'; break;
        case 'blazers': productName = 'Blazers'; image = 'womenBlazer.jpeg'; break;
        default: return res.status(404).send("Item not found");
    }

    const upperWear = ['shirts', 'suits', 'blazers'];
    const bottomWear = ['pants', 'skirts'];
    const wearType = upperWear.includes(item) ? 'upperwear' : bottomWear.includes(item) ? 'bottomwear' : 'unknown';

    res.render("listings/customize", { item: wearType, productName, image });
});

app.get('/my-orders', async (req, res) => {
    if (!req.session.customerId) {
        return res.redirect('/login/customer');
    }

    const orders = await Order.find({ customerId: req.session.customerId });
    res.render('listings/myOrders.ejs', {
        customerName: req.session.customerName,
        orders
    });
});


module.exports = app;
