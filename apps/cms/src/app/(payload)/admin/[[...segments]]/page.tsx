import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { importMap } from "../importMap.js";

type Args = {
	params: Promise<{ segments: string[] }>;
	searchParams: Promise<{ [key: string]: string | string[] }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
	generatePageMetadata({ config, params, searchParams });

export default function Page({ params, searchParams }: Args): Promise<ReactNode> {
	return RootPage({ config, params, searchParams, importMap });
}
