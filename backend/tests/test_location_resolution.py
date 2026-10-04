"""Tests for transient coordinate resolution and canonical LGD validation."""

import pytest

from app.api.routes.locations import get_reverse_geocoder
from app.main import app
from app.services.location_resolution import (
    ReverseGeocodeResult,
    LocationProviderError,
)


class FakeReverseGeocoder:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def reverse(self, latitude, longitude):
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def location_client(client):
    yield client
    app.dependency_overrides.pop(get_reverse_geocoder, None)


def use_provider(provider):
    app.dependency_overrides[get_reverse_geocoder] = lambda: provider


def test_resolve_valid_coordinates_to_canonical_lgd_records(location_client):
    use_provider(FakeReverseGeocoder(ReverseGeocodeResult(
        country_code="in",
        state_name="Uttar Pradesh",
        district_names=("Varanasi",),
    )))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 25.3176, "longitude": 82.9739, "accuracy": 35},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["state"]["id"] == "state-up"
    assert data["state"]["lgd_code"] == 9
    assert data["district"]["id"] == "dist-up-varanasi"
    assert data["district"]["lgd_district_code"] == 178


@pytest.mark.parametrize(
    "payload",
    [
        {"latitude": 91, "longitude": 82.9},
        {"latitude": 25.3, "longitude": 181},
        {"latitude": 25.3, "longitude": 82.9, "accuracy": 0},
        {"latitude": "not-a-number", "longitude": 82.9},
    ],
)
def test_resolve_rejects_malformed_or_out_of_range_coordinates(location_client, payload):
    response = location_client.post("/api/locations/resolve", json=payload)
    assert response.status_code == 422


def test_resolve_rejects_unresolved_location(location_client):
    use_provider(FakeReverseGeocoder(ReverseGeocodeResult(
        country_code="in",
        state_name="Uttar Pradesh",
        district_names=("Unknown District",),
    )))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 25.3, "longitude": 82.9},
    )

    assert response.status_code == 422
    assert "official" in response.json()["detail"]


def test_resolve_rejects_ambiguous_provider_result(location_client):
    use_provider(FakeReverseGeocoder(ReverseGeocodeResult(
        country_code="in",
        state_name="Uttar Pradesh",
        district_names=("Varanasi", "Lucknow"),
    )))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 25.3, "longitude": 82.9},
    )

    assert response.status_code == 422


def test_resolve_handles_reverse_geocoder_failure(location_client):
    use_provider(FakeReverseGeocoder(error=LocationProviderError()))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 25.3, "longitude": 82.9},
    )

    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]


def test_resolve_rejects_coordinates_outside_india(location_client):
    use_provider(FakeReverseGeocoder(ReverseGeocodeResult(
        country_code="np",
        state_name="Bagmati",
        district_names=("Kathmandu",),
    )))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 27.7, "longitude": 85.3},
    )

    assert response.status_code == 422


def test_resolve_with_district_suffix_and_state_alias(location_client):
    use_provider(FakeReverseGeocoder(ReverseGeocodeResult(
        country_code="in",
        state_name="State of Uttar Pradesh",
        district_names=("Varanasi District",),
    )))

    response = location_client.post(
        "/api/locations/resolve",
        json={"latitude": 25.3176, "longitude": 82.9739},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["state"]["id"] == "state-up"
    assert data["district"]["id"] == "dist-up-varanasi"

