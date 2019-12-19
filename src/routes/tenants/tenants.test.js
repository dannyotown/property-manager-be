const supertest = require("supertest");
const app = require("../../server");
const admin = require("../../lib/admin");

const db = require("../../../database/db");

const { Db, Models } = require("../../test-utils");

const request = supertest(app);

beforeEach(async () => {
  await Db.reset();
});

afterAll(async () => {
  await Db.destroyConn();
});

const defaultLandlord = Models.createLandlord();

const testFixture = async () => {
  const users = await Db.insertUsers([
    defaultLandlord,
    Models.createLandlord({
      firstName: "landlord2",
      email: "landlord2@gmail.com"
    })
  ]);

  const properties = await Db.insertProperties([
    Models.createProperty(),
    Models.createProperty()
  ]);

  const tenants = await Db.insertUsers([
    Models.createTenant({
      firstName: "tenant1",
      email: "tenant1@gmail.com",
      residenceId: 1,
      landlordId: 1
    }),
    Models.createTenant({
      firstName: "tenant2",
      email: "tenant2@gmail.com",
      residenceId: 2,
      landlordId: 2
    })
  ]);

  return {
    landlord: users[0],
    landlord2: users[1],
    tenants,
    properties
  };
};

const mockVerifyId = (email = defaultLandlord.email) =>
  admin.verifyIdToken.mockResolvedValue({ email });

describe("POST /api/tenants", () => {
  const endpoint = "/api/tenants";

  it("should return a status of 201 when successfully creating a tenant", async () => {
    await testFixture();
    const fakeToken = "1234";

    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: 1,
      ...tenant
    };

    mockVerifyId();
    const results = await request
      .post(endpoint)
      .set("Authorization", "Bearer " + fakeToken)
      .send(input);

    expect(results.status).toBe(201);
  });

  it("should return the newly created user", async () => {
    let { landlord, properties } = await testFixture();
    const fakeToken = "1234";

    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: properties[0].id,
      ...tenant
    };

    mockVerifyId();
    const results = await request
      .post(endpoint)
      .set("Authorization", "Bearer " + fakeToken)
      .send(input);

    expect(results.body).toEqual({ ...input, id: 5, landlordId: landlord.id });
  });

  it.skip("should validate the users input", () => {});

  it("should return a status of 401 if logged in user is not a landlord", async () => {
    const { properties } = await testFixture();
    const user2 = Models.createTenant({
      firstName: "fake",
      email: "tenantsrouter@gmail.com"
    });

    await Db.insertUsers(user2);

    const fakeToken = "1234";

    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: properties[0].id,
      ...tenant
    };

    mockVerifyId(user2.email);

    const results = await request
      .post(endpoint)
      .set("Authorization", "Bearer " + fakeToken)
      .send(input);

    expect(results.status).toBe(401);
    expect(results.body).toEqual({
      message: "Only landlords are authorized to create tenants"
    });
  });

  it("should return 401 if the user is not authorized to associate the property with the user", async () => {
    const { properties } = await testFixture();
    const landlord2 = Models.createLandlord({
      firstName: "fake",
      email: "tenantsrouter@gmail.com"
    });

    await Db.insertUsers(landlord2);

    const fakeToken = "1234";

    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: properties[0].id,
      ...tenant
    };

    mockVerifyId(landlord2.email);

    const results = await request
      .post(endpoint)
      .set("Authorization", "Bearer " + fakeToken)
      .send(input);

    expect(results.status).toBe(401);
    expect(results.body).toEqual({
      message:
        "Not authorized to create association with another landlords property"
    });
  });

  it("should return a status of 401 if not authorized", async () => {
    const { properties } = await testFixture();
    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: properties[0].id,
      ...tenant
    };

    const results = await request.post(endpoint).send(input);

    expect(results.status).toBe(401);
  });

  it("should change the status of the property from vacant to occupied when a tenant is added", async () => {
    const { properties } = await testFixture();

    const fakeToken = "1234";

    const tenant = Models.createTenant({
      firstName: "peter",
      lastName: "peterton"
    });

    const input = {
      residenceId: properties[0].id,
      ...tenant
    };

    mockVerifyId();
    await request
      .post(endpoint)
      .set("Authorization", "Bearer " + fakeToken)
      .send(input);

    const [prop] = await db
      .from("properties")
      .select("status")
      .where({ id: properties[0].id });

    expect(prop.status).toBe("occupied");
  });

  it.skip("should change the status of the property from occupied to vacant when all tenants are removed", () => {});
});

describe("GET /api/tenants", () => {
  const endpoint = "/api/tenants";

  it("should return a 401 if the user is not logged in", async () => {
    await testFixture();

    mockVerifyId();
    let res = await request.get(endpoint);

    expect(res.status).toBe(401);
  });

  it("should return a 401 if the user is a tenant", async () => {
    let { tenants } = await testFixture();

    mockVerifyId({ email: tenants[0].email });
    let res = await request.get(endpoint).set("Authorzation", "Bearer 1234");

    expect(res.status).toBe(401);
  });

  it("should return a 200 if successful", async () => {
    await testFixture();

    mockVerifyId();
    const res = await request.get(endpoint).set("Authorization", "Bearer 1234");

    expect(res.status).toBe(200);
  });

  it("should return an array of tenants", async () => {
    await testFixture();

    mockVerifyId();
    const res = await request.get(endpoint).set("Authorization", "Bearer 1234");

    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should return of users that all have a landlordId that matches the landlords id", async () => {
    await testFixture();
    await Db.insertUsers([
      Models.createTenant({
        firstName: "fred",
        email: "anothertenant@gmail.com",
        landlordId: 1,
        residenceId: 1
      })
    ]);

    mockVerifyId();
    const res = await request.get(endpoint).set("Authorization", "Bearer 1234");

    const tenants = res.body;

    tenants.forEach(tenant => {
      expect(tenant.landlordId).toBe(1);
    });
  });
});