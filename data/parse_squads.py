#!/usr/bin/env python3
"""Parse Wikipedia 2026 FIFA World Cup squads wikitext into players.json"""
import json, re, unicodedata

d = json.load(open('/Users/benpolak/worldcup-draft/data/squads_raw.json'))
wt = d['parse']['wikitext']

# Split into group sections (==Group A==), then team sections (===Team===)
group_parts = re.split(r'^==\s*(Group [A-L])\s*==\s*$', wt, flags=re.M)

def strip_link(s):
    # [[A|B]] -> B ; [[A]] -> A
    s = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', s)
    return s.strip()

def parse_age(s):
    m = re.search(r'birth date and age2\|\d+\|\d+\|\d+\|(\d+)\|(\d+)\|(\d+)', s)
    if not m:
        return None
    by, bm, bd = map(int, m.groups())
    # age on June 11, 2026
    age = 2026 - by - ((6, 11) < (bm, bd))
    return age

players = []
teams = []
pid = 0
for gi in range(1, len(group_parts), 2):
    group = group_parts[gi]
    body = group_parts[gi + 1]
    team_parts = re.split(r'^===\s*([^=]+?)\s*===\s*$', body, flags=re.M)
    for ti in range(1, len(team_parts), 2):
        team = team_parts[ti].strip()
        tbody = team_parts[ti + 1]
        rows = re.findall(r'\{\{nat fs g player\|(.*?)\}\}\n', tbody)
        if not rows:
            # fallback: templates may not end with newline
            rows = re.findall(r'\{\{nat fs g player\|(.+)', tbody)
        count = 0
        for row in rows:
            fields = {}
            # split on top-level pipes (ignore pipes inside nested {{ }} and [[ ]])
            depth = 0
            cur = ''
            parts = []
            i = 0
            while i < len(row):
                two = row[i:i+2]
                if two in ('{{', '[['):
                    depth += 1; cur += two; i += 2; continue
                if two in ('}}', ']]'):
                    depth -= 1; cur += two; i += 2; continue
                if row[i] == '|' and depth == 0:
                    parts.append(cur); cur = ''; i += 1; continue
                cur += row[i]; i += 1
            parts.append(cur)
            for p in parts:
                if '=' in p:
                    k, v = p.split('=', 1)
                    fields[k.strip()] = v.strip()
            name = strip_link(fields.get('name', ''))
            if not name:
                continue
            pos = fields.get('pos', '').strip()
            club = strip_link(fields.get('club', ''))
            pid += 1
            players.append({
                'id': pid,
                'name': name,
                'team': team,
                'group': group,
                'pos': pos,
                'no': int(fields['no']) if fields.get('no', '').isdigit() else None,
                'age': parse_age(fields.get('age', '')),
                'caps': int(fields['caps']) if fields.get('caps', '').isdigit() else 0,
                'goals': int(fields['goals']) if fields.get('goals', '').isdigit() else 0,
                'club': club,
                'clubnat': fields.get('clubnat', '').strip(),
            })
            count += 1
        teams.append({'team': team, 'group': group, 'players': count})

print(f'{len(teams)} teams, {len(players)} players')
for t in teams:
    flag = '' if t['players'] in (23, 24, 25, 26) else '  <-- CHECK'
    print(f"  {t['group']}  {t['team']:30s} {t['players']}{flag}")

from collections import Counter
print(Counter(p['pos'] for p in players))

json.dump(players, open('/Users/benpolak/worldcup-draft/data/players.json', 'w'), ensure_ascii=False, indent=1)
