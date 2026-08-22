"""
Run script: creates an app symlink/alias and starts uvicorn.
This bridges the gap between the folder name and the app.* imports.
"""
import sys, os

Add the project root's parent to sys.path so import app resolves
to D:\CODEFURYHACATHONNNNNNNNNNNNN (which has init.py, models.py, etc.)
project_dir = os.path.dirname(os.path.abspath(file))
parent_dir = os.path.dirname(project_dir)

Inject the project directory itself as 'app' into sys.modules
by temporarily making it importable
sys.path.insert(0, parent_dir)

Rename-proof: map the long folder name to 'app'
import importlib
folder_name = os.path.basename(project_dir)
if folder_name != "app":
    mod = importlib.import_module(folder_name)
    sys.modules["app"] = mod

if name == "main":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=[project_dir])
