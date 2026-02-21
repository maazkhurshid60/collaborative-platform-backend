// middlewares/multerDocConfig.ts
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

// Enforce PDF-only uploads
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const isPdf =
        file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
        return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
};

const uploadDoc = multer({ storage, fileFilter });

export default uploadDoc;
