const { Client } = require('pg');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cron = require('node-cron'); // Add this line

// PostgreSQL client setup
const client = new Client({
    user: 'pacs',
    host: 'tele.actoneng.com',
    database: 'pacsdb',
    password: 'pacs',
    port: 5432,
});

// UltraMSG API configuration
const ultraMsgUrl = 'https://api.ultramsg.com/instance77436/messages/chat';
const token = '1yowmef5otzuycv0';

// Hardcoded phone number for testing
const testPhoneNumber = '9987774646';

// Function to fetch patient details
async function fetchPatientDetails() {
    const query = `
        SELECT 
            study.study_iuid AS "Study ID",
            TO_CHAR(study.created_time, 'DD-MON-YYYY HH24:MI:SS') AS "Created Time",
            patient_name.alphabetic_name AS "Patient Name",
            ref_physician_name.alphabetic_name AS "Referring Physician Name",
            TO_CHAR(CAST(study.study_date AS DATE), 'DD-MON-YYYY') AS "Study Date",
            TO_CHAR(TO_TIMESTAMP(study.study_time, 'HH24MISS'), 'HH24:MI:SS') AS "Study Time",
            study.study_desc AS "Study Description",
            TO_CHAR(NOW(), 'DD-MON-YYYY HH24:MI:SS') AS "Current Time",
            study.access_control_id AS "AET Title"
        FROM 
            study
        JOIN 
            patient
        ON 
            study.patient_fk = patient.pk
        JOIN 
            person_name AS patient_name
        ON 
            patient.pat_name_fk = patient_name.pk
        JOIN 
            person_name AS ref_physician_name
        ON 
            study.ref_phys_name_fk = ref_physician_name.pk
        WHERE 
            study.created_time BETWEEN NOW() - INTERVAL '30 minutes' AND NOW() - INTERVAL '15 minutes'
        ORDER BY 
            study.created_time ASC;
    `;

    try {
        const res = await client.query(query);
        return res.rows;
    } catch (err) {
        console.error('Error fetching patient details:', err);
        return [];
    }
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(phoneNumber, message) {
    const response = await fetch(ultraMsgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: token,
            to: phoneNumber,
            body: message
        })
    });

    const data = await response.json();
    if (data.sent) {
        console.log('Message sent successfully to', phoneNumber);
    } else {
        console.error('Failed to send message to', phoneNumber);
    }
}

// Function to process patient details and send messages
async function processPatientDetails() {
    const patients = await fetchPatientDetails();
    for (const patient of patients) {
        const { 'Study ID': studyIUID, 'AET Title': aetTitle, 'Patient Name': patientName, 'Created Time': createdTime, 'Referring Physician Name': refPhysicianName, 'Study Date': studyDate, 'Study Time': studyTime, 'Study Description': studyDesc } = patient;

        // Constructing the download and viewer links
        const downloadLink = `https://tele.actoneng.com:8443/dcm4chee-arc/aets/${aetTitle}/rs/studies/${studyIUID}?accept=application/zip&dicomdir=false`;
        const viewerLink = `https://tele.actoneng.com:8082/?study=${studyIUID}`;

        const message = `
            Patient Name: ${patientName}
            Referring Physician Name: ${refPhysicianName}
            Study Date: ${studyDate}
            Study Time: ${studyTime}
            Study Description: ${studyDesc}
            Download Link: ${downloadLink}
            Viewer Link: ${viewerLink}
        `;

        await sendWhatsAppMessage(testPhoneNumber, message);
    }
}

// Connect to the database once, then schedule the task
(async () => {
    await client.connect(); // Connect to the database once

    // Schedule to run every 15 minutes
    cron.schedule('*/15 * * * *', processPatientDetails);

    // Run immediately on start
    processPatientDetails();
})();
