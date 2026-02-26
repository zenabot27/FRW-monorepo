declare module 'browser-passworder' {
  type EncryptedData = {
    data: string;
    iv: string;
    salt: string;
  };

  const encryptor: {
    encrypt<T>(password: string, data: T): Promise<EncryptedData>;
    decrypt<T>(password: string, encryptedData: EncryptedData | unknown): Promise<T>;
  };

  export default encryptor;
}
