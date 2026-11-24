"""Compila un único ejecutable portable para Windows x64."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
from urllib.parse import urlsplit


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--vlc',type=Path,default=Path(os.environ.get('PROGRAMFILES',r'C:\Program Files'))/'VideoLAN/VLC')
    parser.add_argument('--node',type=Path,required=True)
    parser.add_argument('--node-license',type=Path,required=True)
    parser.add_argument('--console',action='store_true')
    parser.add_argument('--onedir',action='store_true')
    args=parser.parse_args()
    args.node=args.node.resolve()
    args.node_license=args.node_license.resolve()
    args.vlc=args.vlc.resolve()
    root=Path(__file__).resolve().parents[1]
    if os.name!='nt' or struct.calcsize('P')!=8:
        parser.error('La compilación requiere Windows y Python x64.')
    for file in (args.vlc/'libvlc.dll',args.vlc/'libvlccore.dll',args.node):
        data=file.read_bytes()
        offset=struct.unpack_from('<I',data,60)[0]
        if data[offset:offset+4]!=b'PE\0\0' or struct.unpack_from('<H',data,offset+4)[0]!=0x8664:
            parser.error('Los componentes nativos deben ser x64.')
    required=('.assistant_prompt.txt','VERSION','activation-public.txt','activation-url.txt',
              'frontend/assets/leytech.ico','frontend/assets/leytech-dark.ico','frontend/assets/leytech-original.png',
              'frontend/assets/discord-button-32.png','frontend/assets/discord-button-48.png','frontend/assets/discord-button-64.png',
              'backend/models/vosk-model-small-es-0.42/am/final.mdl',
              'backend/models/vosk-model-small-en-us-0.15/am/final.mdl')
    if any(not (root/file).is_file() for file in required):
        parser.error('Faltan recursos, claves públicas o el modelo de voz del proyecto.')
    if not re.fullmatch('[a-fA-F0-9]{64}',(root/'activation-public.txt').read_text(encoding='ascii').strip()):
        parser.error('La clave pública de activación no es válida.')
    endpoint=urlsplit((root/'activation-url.txt').read_text(encoding='ascii').strip())
    if endpoint.scheme!='https' or endpoint.path!='/api/assistant/redeem' or endpoint.username or endpoint.query or endpoint.fragment:
        parser.error('La dirección de activación de la entrega debe ser HTTPS.')
    if not (args.vlc/'plugins').is_dir() or not args.node_license.is_file():
        parser.error('Faltan complementos o avisos del reproductor.')
    work=root/'.portable-build'
    work.mkdir(exist_ok=True)
    marker=work/'portable-mode.txt'
    marker.write_text('Leytech portable\n',encoding='ascii')
    notices=work/'Avisos-de-terceros'
    subprocess.run([sys.executable,str(root/'packaging/collect_notices.py'),str(notices)],check=True)
    (notices/'VLC-COPYING.txt').write_bytes((args.vlc/'COPYING.txt').read_bytes())
    (notices/'Node-LICENSE.txt').write_bytes(args.node_license.read_bytes())
    (notices/'LEEME.txt').write_text('Componentes de terceros: consultar los avisos incluidos. Código de VLC: https://www.videolan.org/vlc/ ; Node.js: https://nodejs.org/ ; sus bibliotecas permanecen separadas durante la ejecución.\n',encoding='utf-8')
    command=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--noupx',
             '--onedir' if args.onedir else '--onefile','--console' if args.console else '--windowed',
             '--name','Leytech-Asistente-Portable','--paths',str(root),
             '--distpath',str(root/'entrega'),'--workpath',str(work/'build'),'--specpath',str(work),
             '--manifest',str(root/'leytech.manifest'),'--icon',str(root/'frontend/assets/leytech.ico'),
             '--hidden-import','vosk','--hidden-import','pyaudio','--hidden-import','pyttsx3.drivers.sapi5',
             '--hidden-import','vlc','--collect-binaries','vosk','--collect-all','yt_dlp',
             '--collect-all','yt_dlp_ejs','--copy-metadata','yt_dlp_ejs']
    for source,destination in [(root/'.assistant_prompt.txt','.'),(root/'VERSION','.'),
                               (root/'activation-public.txt','.'),(root/'activation-url.txt','.'),(marker,'.'),
                               (root/'frontend/assets','frontend/assets'),
                               (root/'backend/models','backend/models'),
                               (args.vlc/'plugins','vlc/plugins'),(notices,'Avisos-de-terceros')]:
        command+=['--add-data',f'{source}:{destination}']
    for source,destination in [(args.vlc/'libvlc.dll','vlc'),(args.vlc/'libvlccore.dll','vlc'),(args.node,'runtime')]:
        command+=['--add-binary',f'{source}:{destination}']
    command.append(str(root/'frontend/gui.py'))
    subprocess.run(command,cwd=root,check=True)
    exe=root/'entrega/Leytech-Asistente-Portable.exe'
    if args.onedir:
        exe=root/'entrega/Leytech-Asistente-Portable/Leytech-Asistente-Portable.exe'
    for flag in ('--verify-resources','--verify-player','--verify-portable'):
        result=subprocess.run([str(exe),flag],timeout=180,cwd=work)
        if result.returncode:
            raise RuntimeError('El ejecutable no pasó la comprobación '+flag)
    manifest={'version':(root/'VERSION').read_text().strip(),'python':sys.version.split()[0],
              'sha256':hashlib.sha256(exe.read_bytes()).hexdigest(),
              'dependencies':{item:importlib.metadata.version(item) for item in ('pyinstaller','yt-dlp','yt-dlp-ejs','python-vlc','vosk','openai')}}
    (work/'build-info.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print('PORTABLE_VERIFICADO:',exe,flush=True)


if __name__=='__main__':
    main()
