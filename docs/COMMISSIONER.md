# Commissioner handbook

## First week

1. Sign in as the administrator and replace the bootstrap password.
2. Open league settings, choose a name and pick-window length, and leave registration closed unless you intentionally want signups. Chat, news, and reminder settings belong to this installation.
3. Create players in **Admin → Users**. Deliver initial credentials privately; do not post them in chat or GitHub. Administrators manage the competition and do not submit normal-season picks; use a separate player login for yourself.
4. Add the week and its kickoff/lock information, then add each game. Verify team abbreviations and actual dates. Alternatively enable the optional feed and run sync.
5. Verify the double-points and tiebreaker assignments before players begin. The automated double-points policy uses pregame spread context and Tuesday selection; unavailable data is not guessed. The tiebreaker follows the last eligible kickoff, preserving started locks.
6. Review the player view and pick-status page. Opponent picks become visible only after their individual game starts.

## Game day and scoring

The worker refreshes the optional feed every five minutes. Live detail can include quarter scores, possession, down/distance, venue, broadcast, odds, and box scores when the provider supplies them. It is not a licensed video stream or a guarantee of real-time accuracy. Manual game entry/scoring remains available when feeds are disabled or unavailable.

A correct decisive pick earns the normal point, or the designated double-game points. On a finalized tied game, a submitted pick for either participating team earns one point, including the double game. Missing picks earn none. The tiebreaker is the predicted combined score of its assigned game and locks with that game. Weekly ranking uses the server’s deterministic tiebreaking; overall standings accumulate season results.

Review results before marking a week final or publishing its recap. Use scoring overrides with a clear note only when a correction is necessary, and review the audit history. The previous finalized champion remains highlighted until a new week is finalized. Standings default to the latest week that has started.

## Reminders and community

Configure reminder lead times (minutes before kickoff) under reminders/settings. Only the current unfinished week is targeted. Saved picks and the assigned tiebreaker determine what is missing. The scheduler runs every five minutes, so this is not exact-second delivery. Global notification preferences and device/browser opt-ins apply.

Use announcements for rules and schedule changes; chat supports replies, reactions, and mentions. Friendly challenges are **stake-free** predictions only. Do not arrange money, meals, services, gifts, entry fees, or prizes through the site or off-platform. Remove inappropriate messages and restrict access when needed.

## Seasons and sandbox

Use the separate sandbox to rehearse live scores, picks, and game views. Sandbox data is synthetic and isolated by season; verify the sandbox banner before resetting it. Do not use reset controls on real league records.

Season activation archives prior activity instead of deleting it. Confirm the intended year and phase before transitioning. Back up before structural changes, upgrades, bulk imports, or score corrections. See [Operations](OPERATIONS.md).
