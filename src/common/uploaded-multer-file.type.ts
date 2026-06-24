/** Memory-upload file from Nest FileInterceptor / multer (field: file). */
export type UploadedMulterFile = {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
};
