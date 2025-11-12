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

/**
 * Represents a generic document item stored in DB.
 */
export interface DocumentItem {
  [key: string]: any;
}

/**
 * Represents a native attribute value for DB operations.
 */
export type NativeAttributeValue = any;

/**
 * Interface for DB persistence operations.
 */
export interface DBPersistence {
  /**
   * Creates a new item in the specified DB table.
   * @param tableName The name of the table.
   * @param attrs The attributes of the item to create.
   * @returns Promise resolving to true if creation was successful.
   */
  createItem(tableName: string, attrs: Record<string, any>): Promise<boolean>;

  /**
   * Gets an item by key or creates it if it does not exist.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @param attrName The name of the attribute to set if creating.
   * @param attr The attribute value to set if creating.
   * @returns Promise resolving to the item.
   */
  getOrCreateItem(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue,
    attrName: string,
    attr: NativeAttributeValue
  ): Promise<Record<string, any>>;

  /**
   * Updates an attribute of an item in the table.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @param attrName The name of the attribute to update.
   * @param attr The new attribute value.
   * @returns Promise resolving to the updated item.
   */
  updateItem(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue,
    attrName: string,
    attr: NativeAttributeValue
  ): Promise<Record<string, any>>;

  /**
   * Retrieves an item from the table by key.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @returns Promise resolving to the item or null if not found.
   */
  getItem(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue
  ): Promise<Record<string, any> | null>;

  /**
   * Removes an item from the table by key.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @returns Promise resolving to true if removal was successful.
   */
  removeItem(tableName: string, keyName: string, key: NativeAttributeValue): Promise<boolean>;

  /**
   * Lists items from the table using an index.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @param index The index to use for listing.
   * @returns Promise resolving to an array of items or attribute values.
   */
  listItems(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue,
    index: string
  ): Promise<Record<string, NativeAttributeValue>[] | NativeAttributeValue[]>;

  /**
   * Appends a value to an attribute of an item in the table.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @param attrName The name of the attribute to append to.
   * @param attr The value to append.
   * @returns Promise resolving to the updated item.
   */
  appendItemValue(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue,
    attrName: string,
    attr: NativeAttributeValue
  ): Promise<DocumentItem>;

  /**
   * Removes an attribute from an item in the table.
   * @param tableName The name of the table.
   * @param keyName The name of the key attribute.
   * @param key The key value.
   * @param attrName The name of the attribute to remove.
   * @returns Promise resolving to the updated item.
   */
  removeAttribute(
    tableName: string,
    keyName: string,
    key: NativeAttributeValue,
    attrName: string
  ): Promise<Record<string, any>>;

  /**
   * Cleans up resources used by the persistence layer.
   */
  destroy(): void;
}
