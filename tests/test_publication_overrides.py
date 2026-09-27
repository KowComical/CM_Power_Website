"""No network: retain local metadata while publishing caller-supplied copies."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('website_upload', Path(__file__).resolve().parents[1] / 'upload.py')
website = importlib.util.module_from_spec(spec)
spec.loader.exec_module(website)


class PublicationOverridesTests(unittest.TestCase):
    def test_git_index_and_pages_override_leave_local_metadata_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'; root.mkdir()
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            local = root / 'data/data_description.csv'; local.parent.mkdir()
            full = b'country,source\nTaiwan,local\nPhilippines,NGCP\n'
            public = b'country,source\nPhilippines,NGCP\n'
            local.write_bytes(full)
            overrides = {'data/data_description.csv': public}
            website.git_add_generated_outputs(str(root), overrides)
            staged = subprocess.check_output(['git', '-C', str(root), 'show', ':data/data_description.csv'])
            self.assertEqual(staged, public)
            self.assertEqual(local.read_bytes(), full)
            pages = Path(directory) / 'pages'
            def fake_git(_root, args):
                if args[:2] == ['worktree', 'add']:
                    pages.mkdir()
            with (patch.object(website, 'PAGES_WORKTREE', pages),
                  patch.object(website, 'run_git', side_effect=fake_git),
                  patch.object(website, 'git_has_staged_changes', return_value=False)):
                website.deploy_to_github_pages(str(root), 'test', overrides)
            self.assertEqual((pages / 'data/data_description.csv').read_bytes(), public)
            self.assertEqual(local.read_bytes(), full)

    def test_override_cannot_target_unlisted_or_non_csv_paths(self):
        for name in ('../outside.csv', 'static_site', 'index.html'):
            with self.assertRaises(ValueError):
                website.validated_publication_overrides({name: b'x'})


if __name__ == '__main__':
    unittest.main()
