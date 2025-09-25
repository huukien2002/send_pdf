const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const nodemailer = require("nodemailer");
const path = require("path");
const os = require("os");
const axios = require("axios");

// Khởi tạo Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Cấu hình Nodemailer
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Lấy các post chưa gửi
async function getUnsentPosts() {
  const snapshot = await db
    .collection("posts")
    .where("sent", "==", false)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// Tạo PDF cho mỗi post
async function createPDF(post) {
  const tmpDir = os.tmpdir(); // thư mục tạm cross-platform
  const filePath = path.join(tmpDir, `${post.id}.pdf`);
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  // Tiêu đề và nội dung
  doc.fontSize(20).text(post.title, { underline: true });
  doc.moveDown();
  doc.fontSize(14).text(post.content);

  // Chèn ảnh nếu có
  if (post.imageUrl) {
    try {
      const response = await axios.get(post.imageUrl, {
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(response.data, "binary");
      doc.moveDown();
      doc.image(imageBuffer, { width: 300 });
    } catch (err) {
      console.error(`Không thể tải ảnh: ${post.imageUrl}`, err.message);
    }
  }

  doc.end();
  return filePath;
}

// Gửi mail với PDF đính kèm
async function sendEmail(post, pdfPath) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: post.authorId, // email người nhận
    subject: `📄 Bài mới: ${post.title}`,
    // Dùng HTML thay vì text
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
        <h2 style="color: #2a7ae2;">${post.title}</h2>
        <p>${post.content}</p>
        ${
          post.imageUrl
            ? `<img src="${post.imageUrl}" alt="image" style="max-width:400px; margin-top:10px;">`
            : ""
        }
        <p style="font-size: 0.9em; color: #666;">Ngày đăng: ${
          post.createdAt?.toDate ? post.createdAt.toDate() : ""
        }</p>
      </div>
    `,
    attachments: [{ filename: `${post.title}.pdf`, path: pdfPath }],
  });

  // Đánh dấu post đã gửi
  await db.collection("posts").doc(post.id).update({ sent: true });
}

// Main
async function main() {
  const posts = await getUnsentPosts();
  for (const post of posts) {
    const pdfPath = await createPDF(post);
    await sendEmail(post, pdfPath);
    fs.unlinkSync(pdfPath); // xóa file tạm
    console.log(`Đã gửi bài: ${post.title}`);
  }

  if (posts.length === 0) console.log("Không có bài mới nào để gửi.");
}

main().catch((err) => console.error("Lỗi khi gửi PDF:", err));
