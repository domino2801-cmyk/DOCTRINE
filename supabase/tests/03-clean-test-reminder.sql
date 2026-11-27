-- 03 — NETTOYAGE DU RAPPEL FICTIF
-- Remplacer l'UUID ci-dessous par reminder_id retourné lors de la préparation.
-- Vérifier l'email et l'ID avant suppression : aucune suppression large.

begin;

delete from public.qcm_inactivity_emails q
using auth.users u
where q.user_id = u.id
  and lower(u.email) = lower('test@yopmail.fr')
  and q.id = 'REMPLACER-PAR-UUID-REMINDER-ID'::uuid
  and q.recipient = 'test@yopmail.fr'
returning q.id, q.user_id, q.activity_at, q.status;

-- Si la ligne retournée est bien celle du test, remplacer ROLLBACK par COMMIT.
rollback;
