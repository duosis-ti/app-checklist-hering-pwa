import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadTicket } from '@checklist/shared';
import { HttpError } from './errors.js';
const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:8333';
export const bucket = process.env.S3_BUCKET ?? 'checklist-photos';
export const s3 = new S3Client({
 endpoint, region: process.env.S3_REGION ?? 'us-east-1', forcePathStyle: true,
 requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
 credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY ?? 'checklist-local', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY ?? 'checklist-storage-local-only' }
});
function browserUrl(signed: string) {
 const prefix = process.env.S3_BROWSER_URL_PREFIX ?? process.env.S3_PUBLIC_PREFIX;
 if (!prefix) return signed;
 const url = new URL(signed);
 return `${prefix.replace(/\/$/,'')}${url.pathname}${url.search}`;
}
export async function ensureBucket() {
 try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); }
 catch (error: any) {
  if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound' && error.name !== 'NoSuchBucket') throw error;
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
 }
}
export async function uploadTicket(photo: any): Promise<UploadTicket> {
 const signed = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: photo.storage_key, ContentType: photo.content_type }), { expiresIn: 900 });
 return { photoId: photo.id, url: browserUrl(signed), headers: { 'Content-Type': photo.content_type } };
}
export async function photoUrl(photo: any) { return browserUrl(await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: photo.storage_key }), { expiresIn: 3600 })); }
export async function verifyPhoto(photo: any) {
 let object;
 try { object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: photo.storage_key })); }
 catch (error: any) {
  if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey') throw new HttpError(409, 'Ainda falta enviar uma foto. Tente sincronizar novamente.');
  throw error;
 }
 if (object.ContentLength !== photo.size_bytes || object.ContentType?.split(';')[0] !== photo.content_type) throw new HttpError(422, 'A foto enviada não corresponde ao arquivo esperado.');
}
export function photoKey(storeId: string, ownerKind: 'execucoes'|'planos', ownerId: string, photoId: string, type: string) {
 const extension = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' } as Record<string,string>)[type];
 return `lojas/${storeId}/${ownerKind}/${ownerId}/${photoId}.${extension}`;
}
