const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function getUnsentPosts() {
  const snapshot = await db
    .collection("posts")
    .where("sent", "==", false)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function createPDF(post) {
  const filePath = path.join("/tmp", `${post.id}.pdf`);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text(post.title, { underline: true });
  doc.moveDown();
  doc.fontSize(14).text(post.content);
  if (post.imageUrl) {
    doc.moveDown();
    doc.image(post.imageUrl, { width: 300 });
  }

  doc.end();
  return filePath;
}

async function sendEmail(post, pdfPath) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: "lehuukien270702@gmail.com",
    subject: `Bài mới: ${post.title}`,
    text: post.content,
    attachments: [{ filename: `${post.title}.pdf`, path: pdfPath }],
  });

  await db.collection("posts").doc(post.id).update({ sent: true });
}

async function main() {
  const posts = await getUnsentPosts();
  for (const post of posts) {
    const pdfPath = await createPDF(post);
    await sendEmail(post, pdfPath);
    fs.unlinkSync(pdfPath); // xóa file tạm
  }
}

main().catch(console.error);
