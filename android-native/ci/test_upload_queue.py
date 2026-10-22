"""Execute the actual Room queue SQL against SQLite retry scenarios."""
from pathlib import Path
import re
import sqlite3
import unittest


class UploadQueueTest(unittest.TestCase):
    def setUp(self):
        source = (Path(__file__).resolve().parents[1] / 'core/database/src/main/kotlin/app/gagachat/core/database/dao/UploadDao.kt').read_text()
        self.query = re.search(r'@Query\("""(.*?)"""\)\s*suspend fun getQueued', source, re.S).group(1)
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE pending_uploads (uploadId TEXT, clientMessageId TEXT, state TEXT)')

    def add(self, identifier, message, state):
        self.db.execute('INSERT INTO pending_uploads VALUES (?,?,?)', (identifier, message, state))

    def queued(self):
        return [row[0] for row in self.db.execute(self.query)]

    def test_failed_photo_holds_entire_album_but_not_other_messages(self):
        for failed_index in range(3):
            with self.subTest(failed_index=failed_index):
                self.db.execute('DELETE FROM pending_uploads')
                for i, state in enumerate(['UPLOADED', 'UPLOADING', 'QUEUED']):
                    self.add(str(i), 'album', 'FAILED' if i == failed_index else state)
                self.add('other', 'other-message', 'QUEUED')
                self.assertEqual(['other'], self.queued())

    def test_retry_restores_all_photos_in_selection_order(self):
        self.add('first', 'album', 'UPLOADED')
        self.add('second', 'album', 'FAILED')
        self.add('third', 'album', 'QUEUED')
        self.assertEqual([], self.queued())
        self.db.execute("UPDATE pending_uploads SET state='QUEUED' WHERE state='FAILED'")
        self.assertEqual(['first', 'second', 'third'], self.queued())

    def test_process_restart_keeps_inflight_and_uploaded_rows(self):
        for state in ['QUEUED', 'UPLOADING', 'UPLOADED']:
            self.add(state, state, state)
        self.add('failed', 'failed-message', 'FAILED')
        self.assertEqual(['QUEUED', 'UPLOADING', 'UPLOADED'], self.queued())


if __name__ == '__main__':
    unittest.main()
