"""Set the confirmed public base URL before publishing on the final domain."""
from pathlib import Path
from urllib.parse import urlsplit
from html import escape
import argparse,re,json

parser=argparse.ArgumentParser()
parser.add_argument('--base-url',required=True,help='For example https://your-confirmed-domain.example/')
args=parser.parse_args()
base=args.base_url.strip().rstrip('/')+'/'
url=urlsplit(base)
if url.scheme!='https' or not url.hostname or url.username or url.password or url.query or url.fragment or any(c.isspace() for c in base):
 parser.error('Provide a public HTTPS base URL without credentials, query or fragment.')
folder=Path(__file__).parent
root=folder/'dist' if (folder/'dist/index.html').is_file() else folder
for name,path in [('index.html','')]:
 page=root/name;s=page.read_text()
 s=re.sub(r'\s*<link rel="canonical"[^>]*>','',s)
 s=re.sub(r'\s*<meta (?:property|name)="(?:og:url|og:image(?::(?:alt|type|width|height|secure_url))?|twitter:image(?::alt)?)"[^>]*>','',s)
 image=base+'social-preview.jpg?v=four-barrels-2'
 tags=f'''  <link rel="canonical" href="{escape(base+path,quote=True)}">
  <meta property="og:url" content="{escape(base+path,quote=True)}">
  <meta property="og:image" content="{escape(image,quote=True)}">
  <meta property="og:image:secure_url" content="{escape(image,quote=True)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1672">
  <meta property="og:image:height" content="941">
  <meta property="og:image:alt" content="Мобильный ирландский паб to Dublin на мероприятии">
  <meta name="twitter:image" content="{escape(image,quote=True)}">
  <meta name="twitter:image:alt" content="Мобильный ирландский паб to Dublin на мероприятии">'''
 s=s.replace('</head>',tags+'\n</head>')
 s=s.replace('name="twitter:card" content="summary"','name="twitter:card" content="summary_large_image"')
 def schema(match):
  data=json.loads(match.group(1))
  for item in data['@graph']:
   if item['@type']=='Organization':item.update({'@id':base+'#organization','url':base})
   if item['@type']=='Service':item.update({'@id':base+'#service','url':base+'#overview','provider':{'@id':base+'#organization'}})
  return '<script type="application/ld+json">'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'</script>'
 s=re.sub(r'<script type="application/ld\+json">(.*?)</script>',schema,s,flags=re.S)
 page.write_text(s)
entries='<url><loc>'+escape(base)+'</loc></url>'
(root/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries+'</urlset>\n')
(root/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: '+url.path+'downloads/\nSitemap: '+base+'sitemap.xml\n')
print('Configured canonical URLs, social images, structured data, robots and sitemap for',base)
