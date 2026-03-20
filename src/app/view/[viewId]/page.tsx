type ViewPageProps = {
  params: Promise<{
    viewId: string;
  }>;
};

export default async function ViewPage({ params }: ViewPageProps) {
  const { viewId } = await params;

  return <main>View: {viewId}</main>;
}
