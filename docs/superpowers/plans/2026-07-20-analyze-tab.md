# Analyze tab implementation plan

Date: 2026-07-20  
Spec: `docs/superpowers/specs/2026-07-20-analyze-tab-design.md`

## Files

| File | Role |
|------|------|
| `lib/analyzeSnapshot.ts` (new) | Build paycheck snapshot JSON |
| `lib/ollamaClient.ts` (new) | Call neu2 Ollama chat API |
| `app/api/analyze/snapshot/route.ts` (new) | GET snapshot |
| `app/api/analyze/brief/route.ts` (new) | POST brief via Ollama |
| `app/api/analyze/chat/route.ts` (new) | POST chat via Ollama |
| `components/AnalyzeTab.tsx` (new) | UI: brief + facts + chat |
| `components/TabLayout.tsx` | Add Analyze tab |
| `app/page.tsx` | Wire AnalyzeTab |
| `.env.example`, `docker-compose.yml`, `DEPLOY.md` | OLLAMA_* env |

## Tasks

1. Snapshot builder + Ollama client
2. Three API routes (auth via cookie)
3. AnalyzeTab + TabLayout + page wire
4. Env/docs; `npm run build`
