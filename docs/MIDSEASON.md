# Starting an NFL pickem league midseason

You do not need to wait for Week 1. Decide whether you are starting a new competition today or moving an existing competition with history. Those are different workflows.

## Start a new competition now — recommended

1. Follow [Setup](SETUP.md), using the correct season year. Create your players before the first participating kickoff.
2. Leave the external feed disabled if you want a manually managed schedule.
3. In **Admin → Weeks**, enter the actual NFL week number, such as **10**. Earlier week numbers do not have to exist.
4. In **Admin → Games**, add that week’s upcoming games with their real kickoff times. The current manual form accepts future kickoffs only. If games have already started, agree on the remaining slate or begin with the next full week so everyone has the same opportunity.
5. Review the player view, tiebreaker assignment, and pick window before inviting players to submit. Announce the first week that counts.
6. Enter and verify results, calculate scores, and finalize the week through the commissioner tools as described in the [handbook](COMMISSIONER.md).

Players begin with no historical points. Do not create empty unfinished Weeks 1–9 just to make the numbering continuous: the app uses the earliest unfinished week as its current context. Do not change real kickoff times to let people pick games that have already happened.

## Bring in previous NFL games and results with the optional feed

If you have the necessary permissions for the external data source, enable `ENABLE_ESPN_DATA=true`, recreate the app, and use **Admin → Sync Now**. Review [third-party rights](LEGAL.md) first. Prefer choosing this mode before manually entering a schedule, and back up before changing an existing installation.

The sync process requests missing published weeks for the provider’s current NFL season year, including earlier weeks. It stores game results when supplied. On each sync, it refreshes and finalizes up to three earliest unfinished weeks in the active phase; a midseason first installation may therefore take several runs to catch up. The scheduler normally runs every five minutes. Watch the sync output and **Admin → Weeks** until completed weeks are final and the correct current week is shown. Provider coverage and availability are not guaranteed.

For a specific earlier week that does not exist yet, the **Create Week** action can request its schedule when the feed is enabled. Follow with score sync and verify the game results; creating the week alone is not the same as finishing its scoring/finalization. Do not recreate a week that already exists.

Past kickoffs remain locked to player submissions. Imported NFL results do **not** create historical picks, tiebreaker guesses, or earned player points. If the source is unavailable, the current release has no manual past-game creation workflow; starting with upcoming games remains supported.

## Move an existing competition from a spreadsheet or another site

There is currently **no supported CSV import or migration wizard** for past picks, tiebreakers, and weekly standings. The manual game form rejects past kickoffs. Existing score-correction controls are not a complete history-import workflow and cannot reconstruct accuracy, achievements, or head-to-head records.

A future history importer would need verified game mappings, original picks and tiebreakers, scoring-rule compatibility, a preview/dry run, duplicate detection, and an audit trail. Until that exists, keep the old records separately and start this installation at an agreed week. Do not backdate new picks or open completed games to manufacture history.

The clean baseline migration in this repository is for a new database. It is not an upgrade path for the author’s private deployment or for another pickem application. Never point it at an existing league database without a separately tested migration plan.
