#!/bin/sh
# Menyusun supabase/setup_all.sql = semua migrasi + data awal (satu kali Run di Supabase SQL Editor)
cd "$(dirname "$0")"
{
  echo "-- ============================================================"
  echo "-- SETUP LENGKAP: jalankan SEKALI di Supabase → SQL Editor → New query → Run"
  echo "-- Berisi: skema (0001), keamanan/RLS (0002), tahap 1 (0003), data awal (seed, katalog IT)"
  echo "-- ============================================================"
  cat migrations/*.sql seed/seed.sql seed/seed_it.sql
} > setup_all.sql
