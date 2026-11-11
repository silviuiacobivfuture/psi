import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from "@payloadcms/next/rsc";
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from "@payloadcms/storage-s3/client";
import { SignInWithDirectory as SignInWithDirectory_985c3fe440d71baf76c9873edae5bf27 } from "../../../components/SignInWithDirectory";

/** @type import('payload').ImportMap */
export const importMap = {
	"/components/SignInWithDirectory#SignInWithDirectory":
		SignInWithDirectory_985c3fe440d71baf76c9873edae5bf27,
	"@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
	"@payloadcms/storage-s3/client#S3ClientUploadHandler":
		S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24,
};
