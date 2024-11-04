const express = require('express');
const multer = require('multer');  // For handling file uploads
const path = require('path');
const { getUserByEmail, sendTicketUpdateEmail } = require('./src/functions.js');
const app = express();
const port = 3000;
const connectToDatabase = require('./src/db'); 
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
require('dotenv').config();


const password = '123';
bcrypt.hash(password, 10, (err, hash) => {
    if (err) throw err;
    console.log('Hash:', hash);
});


if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Decode the original name to retain special characters like å, ä, ö
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const timestamp = Date.now();
        cb(null, `${timestamp}-${originalName}`);
    }
});

// Multer upload configuration with file filter
const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept only certain file types (e.g., images, PDFs)
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDFs are allowed'));
        }
    }
});


app.use(session({
    secret: 'AGENT99:00',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true } 
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));




// Route to render index page
app.get('/', (req, res) => {
    res.render('login.ejs');
});


// Only allow access to the signup page if the user is an admin
app.get('/signup', isAuthenticated, isAdmin, (req, res) => {
    if (req.session.user.role !== 'Admin') {
        return res.redirect('/');
    }
    res.render('signup.ejs');
});

// Only allow the admin to create new accounts
app.post('/signup', isAuthenticated, isAdmin, async (req, res) => {
    const { name, email, password, department, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const db = await connectToDatabase();
        const sql = 'CALL CreateUser(?, ?, ?, ?, ?, ?)';
        await db.query(sql, [name, hashedPassword, email, role, department, 'Admin']);
        await db.end();

        console.log(`User ${name} created successfully, redirecting to login`);

        // Redirect to login page after successful signup
        res.redirect('/login');

    } catch (error) {
        console.error('Error during signup process:', error);
        if (error.sqlMessage && error.sqlMessage.includes('User with this email already exists')) {
            return res.status(400).send('User with this email already exists.');
        }
        res.status(500).send('Internal Server Error');
    }
});



app.get('/login', (req, res) => {
    res.render('login.ejs');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('Login attempt with email:', email);

        const user = await getUserByEmail(email);

        if (!user) {
            console.error('User not found');
            return res.render('login.ejs', { error: 'User not found' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        console.log('Password validation result:', isPasswordValid);

        if (!isPasswordValid) {
            console.error('Invalid password');
            return res.render('login.ejs', { error: 'Invalid password' });
        }

        // Store user information in the session
        req.session.user = {
            id: user.id,
            email: user.email,
            role: user.role.toLowerCase(),
            username: user.username
        };

        console.log('User role:', req.session.user.role);

        // Redirect based on the user's role
        if (req.session.user.role === 'admin') {
            console.log('Redirecting to admin dashboard');
            return res.redirect('/admin-dashboard');
        } else if (req.session.user.role === 'agent') {
            console.log('Redirecting to agent dashboard');
            return res.redirect('/agent-dashboard');
        } else {
            console.log('Redirecting to user dashboard');
            return res.redirect('/user-dashboard');
        }

    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Middleware to check if the user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next(); // User is logged in, proceed
    } else {
        return res.redirect('/login'); 
    }
}

// Middleware to check if the user is an admin
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role.toLowerCase() === 'admin') {
        return next(); // User is an admin, proceed
    } else {
        return res.status(403).send('Access denied: Admins only.');
    }
}


// Middleware to check if the user is an agent
function isAgent(req, res, next) {
    if (req.session && req.session.user) {
        if (req.session.user.role === 'agent' || req.session.user.role === 'Admin') {
            return next(); // Proceed if the user is an agent or admin
        } else {
            return res.status(403).send('Access denied: You do not have permission to view this page.');
        }
    } else {
        return res.redirect('/login'); // Redirect to login if not logged in
    }
}

// Middleware to check if the user is authenticated and is a normal user
function isUser(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'user') {
        return next(); // Proceed if the user has the role 'user'
    } else {
        return res.status(403).send('Access denied: Only users can create tickets.');
    }
}

function isUserOrAgent(req, res, next) {
    if (req.session && req.session.user && (req.session.user.role === 'user' || req.session.user.role === 'agent')) {
        return next(); // Proceed if the user is a user or agent
    } else {
        return res.status(403).send('Access denied: Only users and agents can access this page.');
    }
}


// Protect dashboard routes with authentication
app.get('/agent-dashboard', isAuthenticated, isAgent, async (req, res) => {
    try {
        const db = await connectToDatabase();
        
        // Fetch tickets assigned to the logged-in agent
        const [tickets] = await db.query('SELECT * FROM tickets', [req.session.user.id]);
        await db.end();

        const user = req.session.user;

        // Render the agent dashboard with tickets and user information
        res.render('agent-dashboard.ejs', { user, tickets });
    } catch (error) {
        console.error('Error loading agent dashboard:', error);
        res.status(500).send('Internal Server Error');
    }
});



app.get('/admin-dashboard', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const db = await connectToDatabase();
        const [tickets] = await db.query('SELECT * FROM tickets'); // Fetch all tickets from the database
        await db.end();

        const userName = req.session.user.username; // Use the username from the session

        // Render the admin dashboard with tickets and user info
        res.render('admin-dashboard.ejs', { userName, tickets });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        res.status(500).send('Internal Server Error');
    }
});



app.get('/user-dashboard', isAuthenticated, async (req, res) => {
    try {
        const db = await connectToDatabase();
        
        // Fetch tickets for the logged-in user
        const [tickets] = await db.query('SELECT * FROM tickets WHERE user_id = ?', [req.session.user.id]);
        await db.end();

        const user = req.session.user;

        // Render the user dashboard with tickets and user information
        res.render('user-dashboard.ejs', { user, tickets });
    } catch (error) {
        console.error('Error loading user dashboard:', error);
        res.status(500).send('Internal Server Error');
    }
});
// Route to display the ticket creation form (GET)
app.get('/create-ticket', isAuthenticated, isUser, async (req, res) => {
    try {
        const db = await connectToDatabase();
        const [categories] = await db.query('SELECT * FROM categories');
        await db.end();

        res.render('create-ticket.ejs', { user: req.session.user, categories });
    } catch (error) {
        console.error('Error loading categories:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/create-category', isAuthenticated, isAgent, async (req, res) => {
    const { categoryName } = req.body;

    if (!categoryName) {
        return res.status(400).send('Category name is required.');
    }

    try {
        const db = await connectToDatabase();
        const sql = 'INSERT INTO categories (name) VALUES (?)';
        await db.query(sql, [categoryName]);
        await db.end();

        res.redirect('/agent-dashboard'); // Redirect back to the agent dashboard after successful creation
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Route to handle ticket creation (POST)
app.post('/create-ticket', isAuthenticated, isUser, upload.single('attachment'), async (req, res) => {
    const { title, description, category } = req.body;
    const userId = req.session.user.id;
    const attachment = req.file ? req.file.filename : null;

    // Debugging: log the parsed form data and file information
    console.log('Received form data:', req.body);
    console.log('Received file:', req.file);

    if (!title || !description || !category || !userId) {
        console.log('Missing field:', { title, description, category, userId });
        return res.status(400).send('All fields are required.');
    }

    try {
        const db = await connectToDatabase();
        const sql = 'INSERT INTO tickets (title, description, category, status, created_at, user_id, attachment) VALUES (?, ?, ?, ?, NOW(), ?, ?)';
        const status = 'open'; // Default status for new tickets
        await db.query(sql, [title, description, category, status, userId, attachment]);
        await db.end();

        res.redirect('/user-dashboard'); // Redirect to user dashboard after successful ticket creation
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).send('Internal Server Error');
    }
});
app.get('/tickets', isAuthenticated, async (req, res) => {
    try {
        const db = await connectToDatabase();
        const [tickets] = await db.query('SELECT * FROM tickets');
        await db.end();

        res.render('tickets.ejs', { tickets });
    } catch (error) {
        console.error('Error loading tickets:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/tickets/:id', isAuthenticated, async (req, res) => {
    const ticketId = req.params.id;

    try {
        const db = await connectToDatabase();
        // Fetch ticket details
        const [ticketResult] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        const ticket = ticketResult[0];

        // Fetch knowledge base articles associated with the ticket
        const [articles] = await db.query('SELECT * FROM knowledge_base WHERE ticket_id = ?', [ticketId]);

        await db.end();

        if (!ticket) {
            return res.status(404).send('Ticket not found');
        }

        res.render('ticket-details.ejs', { ticket, articles });
    } catch (error) {
        console.error('Error loading ticket details:', error);
        res.status(500).send('Internal Server Error');
    }
});



app.post('/tickets/:id/status', isAuthenticated, isUserOrAgent, async (req, res) => {
    const ticketId = req.params.id;
    const { status } = req.body;

    if (!['open', 'closed'].includes(status)) {
        return res.status(400).send('Invalid status value.');
    }

    try {
        const db = await connectToDatabase();
        const sql = 'UPDATE tickets SET status = ? WHERE id = ?';
        await db.query(sql, [status, ticketId]);
        await db.end();

        res.redirect(`/tickets/${ticketId}`); // Redirect back to the ticket details page
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/update-ticket/:id', isAuthenticated, isAgent, async (req, res) => {
    const ticketId = req.params.id;
    const { status, description } = req.body;
    console.log("SMTP Host:", process.env.SMTP_HOST);
console.log("SMTP Port:", process.env.SMTP_PORT);
console.log("Email Address:", process.env.EMAIL_ADDRESS);


    try {
        const db = await connectToDatabase();

        // Fetch the current ticket information
        const [ticketResults] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
        if (ticketResults.length === 0) {
            return res.status(404).send('Ticket not found');
        }

        const ticket = ticketResults[0];

        // Update the ticket in the database
        const updateSql = 'UPDATE tickets SET status = ?, description = ?, updated_at = NOW() WHERE id = ?';
        await db.query(updateSql, [status, description, ticketId]);

        // Fetch the user's email
        const [userResults] = await db.query('SELECT email FROM users WHERE id = ?', [ticket.user_id]);
        if (userResults.length === 0) {
            return res.status(404).send('User not found');
        }

        const userEmail = userResults[0].email;

        // Update the ticket object with the new information for email
        ticket.status = status;
        ticket.description = description;

        // Send the update email
        sendTicketUpdateEmail(userEmail, ticket);

        await db.end();
        res.redirect('/agent-dashboard'); // Redirect after updating
    } catch (error) {
        console.error('Error updating ticket:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Failed to log out.');
        }
        res.clearCookie('connect.sid'); // Clears the session cookie
        res.redirect('/login'); // Redirect to login page after logging out
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
