-- Categoria nova: dating (speed dating, trobades per a solters, activitats per conèixer parella).
alter type event_category add value if not exists 'dating';

-- Interès inicial "normal", com les altres categories.
update user_prefs set category_weights = category_weights || '{"dating": 0.5}'::jsonb
 where not category_weights ? 'dating';
