-- A Pay card's or an invoice's due day joins `card_start_at` (review 2026-10-09 M14): when a
-- card is for, whichever kind, so the calendar shows what's owed on its day and search finds an
-- invoice by when it's due. Written by the server with the card (`cardStartAt`); backfilled here.
update messages
  set card_start_at = (payload->'fields'->>'due' || 'T00:00:00Z')::timestamptz
  where kind = 'kit'
    and card_start_at is null
    and payload->>'kit' in ('payment_request', 'invoice')
    and payload->'fields'->>'due' ~ '^\d{4}-\d{2}-\d{2}$';
-- A card that asks is a request (M14): the inbox says so until the move that answers it.
update messages
  set is_request = true
  where kind = 'kit'
    and deleted_at is null
    and not is_request
    and (
      (payload->>'kit' = 'approval' and payload->>'state' = 'pending')
      or (payload->>'kit' = 'meeting' and payload->>'state' = 'proposed')
      or (payload->>'kit' = 'document_review' and payload->>'state' in ('requested', 'in_review'))
      or (payload->>'kit' = 'order_status' and payload->>'state' = 'placed')
      or (payload->>'kit' = 'invoice' and payload->>'state' in ('sent', 'overdue'))
      or (payload->>'kit' = 'purchase_order' and payload->>'state' = 'sent')
      or (payload->>'kit' = 'payment_request' and payload->>'state' = 'requested'
          and coalesce(payload->'fields'->>'direction', 'ask') <> 'send')
      or (payload->>'kit' = 'support_ticket' and payload->>'state' = 'open')
      or (payload->>'kit' = 'appointment' and payload->>'state' = 'requested')
    );
