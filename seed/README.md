# seed/ — Datos + n8n (dueño: R3)

Acá van, según `PROYECTO.md` (secciones 4.1, 4.5 y 5):

- SQL de las tablas de Supabase (sección 4.1) y `reset_demo.sql`.
- Los 2 transcripts de ejemplo (dorado ~300 palabras / realista ~800 palabras con muletillas).
  Ya viven también en `frontend/src/lib/mock-data.ts` (`GOLDEN_TRANSCRIPT`, `REALISTIC_TRANSCRIPT`)
  para que el frontend pueda demostrar el flujo completo sin depender de este backend.
- `cached/` con respuestas reales de la IA como respaldo para la demo.
- El workflow de n8n ("Aprobación") y su URL de webhook (va en el vault del equipo y en `backend/.env`).
