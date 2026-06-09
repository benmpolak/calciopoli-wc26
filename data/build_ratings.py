#!/usr/bin/env python3
"""Regenerate js/data.js with projected-points ratings.

Rating = expected fantasy points for the tournament under league scoring:
  team strength (ESPN outright odds, June 2026) -> expected matches + clean-sheet odds
  squad pecking order (caps, shirt number, age) -> chance of starting
  international goals per cap -> attacking returns
"""
import json

players = json.load(open('/Users/benpolak/worldcup-draft/data/players.json'))

# ESPN outright winner odds, June 9 2026 (espn.com betting futures)
ODDS = {
    'Spain': 4.5, 'France': 4.75, 'England': 7, 'Portugal': 8.5, 'Argentina': 9, 'Brazil': 9.5,
    'Germany': 14, 'Netherlands': 20, 'Norway': 35, 'Belgium': 40, 'Colombia': 40, 'Morocco': 50,
    'United States': 60, 'Switzerland': 65, 'Uruguay': 65, 'Japan': 65, 'Mexico': 80, 'Ecuador': 80,
    'Turkey': 90, 'Croatia': 90, 'Senegal': 90, 'Sweden': 120, 'Austria': 150, 'Canada': 200,
    'Scotland': 200, 'Ivory Coast': 250, 'Czech Republic': 250, 'Paraguay': 300, 'Egypt': 300,
    'Ghana': 300, 'Algeria': 350, 'South Korea': 400, 'Bosnia and Herzegovina': 500, 'Tunisia': 500,
    'Australia': 600, 'Iran': 700, 'DR Congo': 1000, 'Saudi Arabia': 1000, 'South Africa': 1000,
    'Panama': 1000, 'Cape Verde': 1000, 'Qatar': 1500, 'Uzbekistan': 1500, 'New Zealand': 1500,
    'Iraq': 1500, 'Jordan': 2500, 'Curaçao': 2500, 'Haiti': 2500,
}
teams_in_data = {p['team'] for p in players}
missing = teams_in_data - set(ODDS)
assert not missing, f'no odds for: {missing}'

def team_profile(odds):
    """expected matches, clean-sheet prob per match, attacking multiplier"""
    bands = [
        (10,   6.3, 0.42, 1.25),
        (20,   5.5, 0.38, 1.15),
        (50,   4.8, 0.33, 1.05),
        (100,  4.2, 0.28, 1.00),
        (300,  3.7, 0.24, 0.92),
        (800,  3.3, 0.20, 0.85),
        (9999, 3.0, 0.16, 0.78),
    ]
    for cap, games, cs, att in bands:
        if odds <= cap:
            return games, cs, att

GOAL_PTS = {'GK': 6, 'DF': 6, 'MF': 5, 'FW': 4}
SLOTS = {'GK': 1, 'DF': 4, 'MF': 4, 'FW': 2}

# pecking order within team+position: caps, then goals, then low shirt number
by_team_pos = {}
for p in players:
    by_team_pos.setdefault((p['team'], p['pos']), []).append(p)
for group in by_team_pos.values():
    group.sort(key=lambda p: (-p['caps'], -p['goals'], p['no'] if p['no'] else 99))
    for rank, p in enumerate(group, 1):
        p['_rank'] = rank

for p in players:
    games, cs_prob, att_mult = team_profile(ODDS[p['team']])
    slots = SLOTS[p['pos']]
    r = p['_rank']
    if r <= slots:
        start_prob = 0.88 - 0.03 * (r - 1)
    elif r == slots + 1:
        start_prob = 0.50
    elif r == slots + 2:
        start_prob = 0.32
    else:
        start_prob = 0.15
    if p['no'] and p['no'] <= 11:
        start_prob = min(0.92, start_prob + 0.06)
    if p['age'] and p['age'] >= 36:
        start_prob = max(0.10, start_prob - 0.08)

    goal_rate = min(0.85, p['goals'] / max(p['caps'], 15)) * att_mult
    assist_rate = 0.4 * goal_rate + {'GK': 0.0, 'DF': 0.02, 'MF': 0.05, 'FW': 0.05}[p['pos']]
    per_start = 2 + goal_rate * GOAL_PTS[p['pos']] + assist_rate * 3
    if p['pos'] in ('GK', 'DF'):
        per_start += cs_prob * 4
    exp_pts = games * (start_prob * per_start + (1 - start_prob) * 0.35 * 1)
    p['rating'] = round(exp_pts)

# regenerate data.js (teams meta unchanged)
META = {
 'Czech Republic': ('cz', ['czechia','czech republic']), 'Mexico': ('mx', ['mexico']),
 'South Africa': ('za', ['south africa']), 'South Korea': ('kr', ['south korea','korea republic']),
 'Bosnia and Herzegovina': ('ba', ['bosnia and herzegovina','bosnia-herzegovina','bosnia']),
 'Canada': ('ca', ['canada']), 'Qatar': ('qa', ['qatar']), 'Switzerland': ('ch', ['switzerland']),
 'Brazil': ('br', ['brazil']), 'Haiti': ('ht', ['haiti']), 'Morocco': ('ma', ['morocco']),
 'Scotland': ('gb-sct', ['scotland']), 'Australia': ('au', ['australia']), 'Paraguay': ('py', ['paraguay']),
 'Turkey': ('tr', ['turkey','turkiye']), 'United States': ('us', ['united states','usa','united states of america']),
 'Curaçao': ('cw', ['curacao']), 'Ecuador': ('ec', ['ecuador']), 'Germany': ('de', ['germany']),
 'Ivory Coast': ('ci', ['ivory coast',"cote d'ivoire",'cote divoire']), 'Japan': ('jp', ['japan']),
 'Netherlands': ('nl', ['netherlands']), 'Sweden': ('se', ['sweden']), 'Tunisia': ('tn', ['tunisia']),
 'Belgium': ('be', ['belgium']), 'Egypt': ('eg', ['egypt']), 'Iran': ('ir', ['iran','ir iran']),
 'New Zealand': ('nz', ['new zealand']), 'Cape Verde': ('cv', ['cape verde','cabo verde']),
 'Saudi Arabia': ('sa', ['saudi arabia']), 'Spain': ('es', ['spain']), 'Uruguay': ('uy', ['uruguay']),
 'France': ('fr', ['france']), 'Iraq': ('iq', ['iraq']), 'Norway': ('no', ['norway']),
 'Senegal': ('sn', ['senegal']), 'Algeria': ('dz', ['algeria']), 'Argentina': ('ar', ['argentina']),
 'Austria': ('at', ['austria']), 'Jordan': ('jo', ['jordan']), 'Colombia': ('co', ['colombia']),
 'DR Congo': ('cd', ['dr congo','congo dr','democratic republic of the congo','drc']),
 'Portugal': ('pt', ['portugal']), 'Uzbekistan': ('uz', ['uzbekistan']), 'Croatia': ('hr', ['croatia']),
 'England': ('gb-eng', ['england']), 'Ghana': ('gh', ['ghana']), 'Panama': ('pa', ['panama']),
}
groups = {p['team']: p['group'] for p in players}
teams = [{'name': t, 'group': groups[t], 'flag': META[t][0], 'aliases': META[t][1]}
         for t in sorted(teams_in_data)]
slim = [{'id': p['id'], 'name': p['name'], 'team': p['team'], 'pos': p['pos'], 'no': p['no'],
         'age': p['age'], 'caps': p['caps'], 'goals': p['goals'], 'club': p['club'],
         'rating': p['rating']} for p in players]

with open('/Users/benpolak/worldcup-draft/js/data.js', 'w') as f:
    f.write('// Generated from Wikipedia "2026 FIFA World Cup squads" (final 26-man lists)\n')
    f.write('// rating = projected fantasy points (team odds x start likelihood x scoring history)\n')
    f.write('const TEAMS = ' + json.dumps(teams, ensure_ascii=False) + ';\n')
    f.write('const PLAYERS = ' + json.dumps(slim, ensure_ascii=False) + ';\n')

top = sorted(players, key=lambda p: -p['rating'])[:25]
print('TOP 25 PROJECTED:')
for p in top:
    print(f"  {p['rating']:>3}  {p['name']:28s} {p['pos']}  {p['team']:15s} caps {p['caps']} goals {p['goals']}")
