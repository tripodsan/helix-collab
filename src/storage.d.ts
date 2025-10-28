/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
declare class Storage {
  constructor(ps: any, docTableName: string);

  getOrCreateDoc(docName: string, attrName: string, attrValue: any): Promise<DocumentItem>;

  updateDoc(docName: string, attrName: string, attrValue: any): Promise<boolean>;

  storeDoc(docName: string, attrName: string, attrValue: any): Promise<boolean>;

  getDoc(docName: string): Promise<DocumentItem | null>;

  deleteDoc(docName: string): Promise<boolean>;

  listDocs(): Promise<DocumentItem[]>;
}

interface DocumentItem {
  [key: string]: any;
}

export = Storage;
