export async function POST() {
  return Response.json(
    {
      status: "accepted-not-stored",
      message:
        "This demonstration endpoint reserves the future water-table sensor integration; no sensor data is stored.",
    },
    { status: 202 },
  );
}
