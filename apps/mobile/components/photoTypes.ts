export interface PickedPhoto {
  uri: string;
  base64: string;
  name: string;
}
export interface PhotoPickerProps {
  remaining: number;
  disabled?: boolean;
  onFiles: (files: PickedPhoto[]) => Promise<void>;
  onError: (message: string) => void;
}
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
