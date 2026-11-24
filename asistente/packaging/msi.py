"""Author a per-user Windows Installer package from the assembled app."""
import argparse
import hashlib
import uuid
from pathlib import Path
from xml.etree import ElementTree as xml

NS = "http://schemas.microsoft.com/wix/2006/wi"
xml.register_namespace("", NS)
UPGRADE_CODE = "ED992539-6F31-4D94-BC7A-3AE595F39D0D"
APP_KEY = r"Software\Leytech\Asistente\Installer"


def add(parent: xml.Element, name: str, **attrs: str) -> xml.Element:
    return xml.SubElement(parent, f"{{{NS}}}{name}", attrs)


def identifier(prefix: str, value: str) -> str:
    return prefix + hashlib.sha256(value.casefold().encode()).hexdigest()[:28]


def guid(value: str) -> str:
    return str(uuid.uuid5(uuid.UUID(UPGRADE_CODE), value)).upper()


def folder_component(
    source: Path,
    relative: Path,
    directory: xml.Element,
    feature: xml.Element,
) -> None:
    label = relative.as_posix()
    key = identifier("C_", label)
    component = add(directory, "Component", Id=key, Guid=guid("folder:" + label.casefold()), Win64="yes")
    add(component, "RegistryValue", Root="HKCU", Key=APP_KEY, Name=key, Type="integer", Value="1", KeyPath="yes")
    add(component, "RemoveFolder", Id=identifier("R_", label), On="uninstall")
    add(feature, "ComponentRef", Id=key)
    if relative == Path("."):
        # Windows Installer removes this parent only if no other files remain.
        add(component, "RemoveFolder", Id="RemoveEmptyUserPrograms", Directory="UserPrograms", On="uninstall")
        add(component, "RemoveFile", Id="RemoveOldUninstaller", Name="Desinstalar.exe", On="install")
        add(component, "RemoveRegistryKey", Id="RemoveOldLeytechEntry", Root="HKCU",
            Key=r"Software\Microsoft\Windows\CurrentVersion\Uninstall\LeytechAsistente",
            Action="removeOnInstall")
    for file in sorted(source.iterdir()):
        item = relative / file.name
        if file.is_dir():
            new_dir = add(directory, "Directory", Id=identifier("D_", item.as_posix()), Name=file.name)
            folder_component(file, item, new_dir, feature)
        elif file.is_file():
            file_id = "AssistantExe" if item == Path("LeytechAsistente.exe") else identifier("F_", item.as_posix())
            add(component, "File", Id=file_id, Name=file.name, Source=str(file))


def author(app: Path, icon: Path, version: str) -> xml.ElementTree:
    doc = xml.Element(f"{{{NS}}}Wix")
    product = add(doc, "Product", Id=guid("product:" + version), Name="Leytech Asistente",
                  Language="1034", Manufacturer="Leytech", Version=version, UpgradeCode=UPGRADE_CODE)
    add(product, "Package", InstallerVersion="500", Compressed="yes", InstallScope="perUser",
        InstallPrivileges="limited", Manufacturer="Leytech")
    add(product, "MediaTemplate", EmbedCab="yes", CompressionLevel="mszip")
    add(product, "MajorUpgrade", Schedule="afterInstallInitialize",
        DowngradeErrorMessage="El instalador es anterior al asistente que tienes.")
    add(product, "Property", Id="ARPPRODUCTICON", Value="LeytechIcon")
    add(product, "Property", Id="ARPNOMODIFY", Value="1")
    add(product, "Property", Id="ARPNOREPAIR", Value="1")
    add(product, "Icon", Id="LeytechIcon", SourceFile=str(icon))
    feature = add(product, "Feature", Id="Assistant", Title="Leytech Asistente", Level="1")
    target = add(product, "Directory", Id="TARGETDIR", Name="SourceDir")
    add(target, "Directory", Id="SystemFolder")
    local = add(target, "Directory", Id="LocalAppDataFolder")
    programs = add(local, "Directory", Id="UserPrograms", Name="Programs")
    install = add(programs, "Directory", Id="INSTALLFOLDER", Name="Leytech Asistente")
    folder_component(app, Path("."), install, feature)

    menu = add(target, "Directory", Id="ProgramMenuFolder")
    shortcuts = add(menu, "Directory", Id="LeytechStartMenu", Name="Leytech")
    shortcut = add(shortcuts, "Component", Id="StartMenuEntry", Guid=guid("shortcut"), Win64="yes")
    add(shortcut, "Shortcut", Id="LaunchAssistant", Name="Leytech Asistente",
        Target="[INSTALLFOLDER]LeytechAsistente.exe", WorkingDirectory="INSTALLFOLDER", Icon="LeytechIcon")
    add(shortcut, "RemoveFolder", Id="RemoveLeytechStartMenu", On="uninstall")
    add(shortcut, "RegistryValue", Root="HKCU", Key=APP_KEY, Name="Shortcut",
        Type="integer", Value="1", KeyPath="yes")
    add(feature, "ComponentRef", Id="StartMenuEntry")

    # The application creates this one startup value only when the user opts in.
    add(product, "CustomAction", Id="RemoveAssistantStartup", Directory="SystemFolder",
        ExeCommand=r'"[SystemFolder]reg.exe" delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ComputadoraAssistant /f',
        Execute="deferred", Impersonate="yes", Return="ignore")
    sequence = add(product, "InstallExecuteSequence")
    add(sequence, "Custom", Action="RemoveAssistantStartup", Before="InstallFinalize").text = (
        'REMOVE="ALL" AND NOT UPGRADINGPRODUCTCODE'
    )
    return xml.ElementTree(doc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("app", type=Path)
    parser.add_argument("icon", type=Path)
    parser.add_argument("version")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    app = args.app.resolve(strict=True)
    if not (app / "LeytechAsistente.exe").is_file():
        parser.error("Falta LeytechAsistente.exe en la carpeta compilada.")
    tree = author(app, args.icon.resolve(strict=True), args.version)
    xml.indent(tree)
    tree.write(args.output, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    main()
