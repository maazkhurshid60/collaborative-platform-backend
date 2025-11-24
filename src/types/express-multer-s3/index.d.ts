import 'multer';
declare module 'multer' {
    interface File {
        location?: string;
    }
}
