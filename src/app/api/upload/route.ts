import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Upload gambar produk.
 * - Produksi (Vercel): Supabase Storage — butuh SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * - Dev fallback: filesystem lokal public/uploads (Vercel read-only, tidak tersedia).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "File tidak ada" }, { status: 400 });
  }

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Format harus PNG/JPG/WebP" }, { status: 400 });
  }
  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ error: "Maksimal 3MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `products/${crypto.randomBytes(8).toString("hex")}.${ext}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "product-images";

  // --- Jalur Supabase Storage (produksi) ---
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      });

      const { error } = await supabase.storage.from(bucket).upload(name, bytes, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        return NextResponse.json({ error: `Storage: ${error.message}` }, { status: 500 });
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(name);
      return NextResponse.json({ url: data.publicUrl });
    } catch (e) {
      console.error("upload supabase error", e);
      return NextResponse.json({ error: "Gagal upload ke storage" }, { status: 500 });
    }
  }

  // --- Fallback lokal (development) ---
  const localName = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, localName), bytes);
  return NextResponse.json({ url: `/uploads/${localName}` });
}
