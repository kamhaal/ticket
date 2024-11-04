const connectToDatabase = require('./db'); 
const transporter = require('../mailer');


async function getUserByEmail(email) {
    try {
        const db = await connectToDatabase(); 
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        await db.end(); 

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    } catch (error) {
        console.error('Error fetching user:', error);
        throw error;
    }
}

function sendTicketUpdateEmail(userEmail, ticket) {
    console.log('Sending email to:', userEmail); 
    console.log('Ticket details:', ticket); 

    const mailOptions = {
        from: process.env.EMAIL_ADDRESS,
        to: userEmail,
        subject: `Update on Your Ticket: ${ticket.title}`,
        html: `
            <p>Hello,</p>
            <p>Your ticket titled <strong>${ticket.title}</strong> has been updated. Here are the details:</p>
            <ul>
                <li><strong>Status:</strong> ${ticket.status}</li>
                <li><strong>Description:</strong> ${ticket.description}</li>
                <li><strong>Category:</strong> ${ticket.category}</li>
            </ul>
            <p>Please log in to your account for more information.</p>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error); 
        } else {
            console.log('Email sent:', info.response);
        }
    });
}


module.exports = {
    getUserByEmail,
    sendTicketUpdateEmail
};
