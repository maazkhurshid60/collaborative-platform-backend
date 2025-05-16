// middlewares/multer.ts
import multer from 'multer';
import path from 'path';

// Setup storage
const storage = multer.diskStorage({
    destination: './uploads/docs/',
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

// Optional: Add file type filter (PDF/DOC/DOCX)
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only PDF and Word documents are allowed'));
    }
    cb(null, true);
};

const uploadDoc = multer({ storage, fileFilter });

export default uploadDoc;
