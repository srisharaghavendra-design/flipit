import json,urllib.request as U
b=json.load(open('baselines.json'));t={x['task'] if 'task' in x else k:x for k,x in (b['tasks'].items() if isinstance(b['tasks'],dict) else [(x['task'],x) for x in b['tasks']])}
for k,v in {'code':10,'code_sfdc':15,'budget':5,'sow':17.5}.items(): assert t[k]['source']=='SRISHA' and t[k]['baselineMinutes']==v,k
for k in ['upload','report']: assert t[k]['source']=='ASSUMPTION',k
r=json.load(U.urlopen('http://localhost:8787/api/engine/efficiency'))
for x in r['tasks']:
  if x.get('speedup') and x['source']!='PLACEHOLDER': assert (x['speedup']>=20)==x['meets20x'],x['task']
e=r['endToEnd']; assert e['meets20x']==(e['touchSpeedup']>=20)
assert r['repeatEntry']['today']['fieldEntries']==57 and r['repeatEntry']['mops']['fieldEntries']==14 if 'today' in r['repeatEntry'] else True
print('efficiency honesty OK', r['under20x'], e['touchSpeedup'])
