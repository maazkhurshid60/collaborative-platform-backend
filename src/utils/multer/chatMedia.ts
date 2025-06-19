import multer from 'multer';

const storage = multer.memoryStorage(); // Files stored in RAM

// Accept all file types
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    cb(null, true); // Accept all files
};

const uploadChatMedia = multer({ storage, fileFilter });

export default uploadChatMedia;
