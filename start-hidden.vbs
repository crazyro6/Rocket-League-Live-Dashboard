' Launches the RL Stats server completely hidden (no terminal window).
' Used by the Windows auto-start shortcut.
Set fso = CreateObject("Scripting.FileSystemObject")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projDir
' 0 = hidden window, False = don't wait
sh.Run """" & projDir & "\serve-hidden.bat""", 0, False
