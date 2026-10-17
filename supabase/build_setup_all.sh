#!/bin/sh
# Menyusun supabase/setup_all.sql = semua migrasi + data awal (satu kali Run di Supabase SQL Editor)
cd "$(dirname "$0")"
{
  echo "-- ============================================================"
  echo "-- SETUP LENGKAP: jalankan SEKALI di Supabase → SQL Editor → New query → Run"
  echo "-- Berisi: skema (0001), keamanan/RLS (0002), tahap 1 (0003), data awal (seed, katalog IT)"
  echo "-- ============================================================"
  cat migrations/0001*.sql migrations/0002*.sql migrations/0003*.sql seed/seed.sql seed/seed_it.sql migrations/0004*.sql migrations/0005*.sql migrations/0006*.sql migrations/0007*.sql migrations/0008*.sql migrations/0009*.sql migrations/0010*.sql migrations/0011*.sql migrations/0012*.sql
} > setup_all.sql
