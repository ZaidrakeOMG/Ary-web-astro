"""Run the unchanged form/guide regression suites as a visitor who chose No.
Only an initial UI choice is seeded. All original assertions, CSP, API mocks,
routes and viewports run unchanged. Consent Yes/No is covered separately by
chat_browser_test.py, including no media calls before and after opting out.
"""
import runpy
import sys
from pathlib import Path
from unittest.mock import patch
from playwright.sync_api import Browser

name = sys.argv[1] if len(sys.argv) == 2 else ''
if name not in {'browser_test.py', 'assistant_test.py'}:
    raise SystemExit('Expected browser_test.py or assistant_test.py')
original = Browser.new_context

def without_prompt(self, *args, **kwargs):
    context = original(self, *args, **kwargs)
    context.add_init_script("try { sessionStorage.setItem('ary-voice-choice-v1','skip'); } catch {}")
    return context

with patch.object(Browser, 'new_context', without_prompt):
    runpy.run_path(str(Path(__file__).resolve().with_name(name)), run_name='__main__')
