import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/** Pilih gambar dari galeri lalu unggah ke bucket Supabase. Mengembalikan path & URL (public bucket) atau signed URL. */
export async function pickAndUpload(bucket: 'avatars' | 'merchant-images' | 'documents' | 'proofs' | 'promo-images', userId: string, opts?: { camera?: boolean }) {
  const perm = opts?.camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Izin akses galeri/kamera ditolak');
  const res = opts?.camera
    ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const ext = (asset.fileName?.split('.').pop() || asset.uri.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}.${ext === 'png' || ext === 'webp' ? ext : 'jpg'}`;
  const blob = await (await fetch(asset.uri)).blob();
  const contentType = asset.mimeType ?? (ext === 'png' ? 'image/png' : 'image/jpeg');
  const buf = await new Response(blob).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  const isPublic = bucket === 'avatars' || bucket === 'merchant-images' || bucket === 'promo-images';
  const url = isPublic ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : path;
  return { path, url };
}

export async function signedUrl(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
