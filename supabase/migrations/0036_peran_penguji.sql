-- Peran baru "penguji" (beta tester dari luar). Dipisah dari 0037 karena nilai enum baru
-- harus di-commit dulu sebelum bisa dipakai sebagai default / di dalam fungsi.
alter type public.app_role add value if not exists 'penguji';
