Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c cd /d """ & folder & """ && Booky.cmd"

shell.Run command, 0, False
