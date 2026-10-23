import { createContext, useContext, useEffect, useState } from 'react';
import { api, useServerVersion, type Folder } from './api';

export const FoldersContext = createContext<Folder[]>([]);
export const useFolderList = () => useContext(FoldersContext);

// 폴더 목록을 불러오고, 누가 바꾸면 다시 불러온다
export function useFolders() {
  const version = useServerVersion();
  const [folders, setFolders] = useState<Folder[]>([]);
  useEffect(() => { api.folders().then(setFolders).catch(() => {}); }, [version]);
  return folders;
}
