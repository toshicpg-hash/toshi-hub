# Synthetic UI verification only

Never merge this QA branch into production. It deliberately excludes personal bootstrap records and account-specific OAuth configuration. Keep test fixtures synthetic, external requests blocked, workflow permissions read-only, and never add real account state or secrets. Run the unit and desktop/mobile browser tests. Screenshots may contain synthetic fixtures only. The production patch is maintained separately.
