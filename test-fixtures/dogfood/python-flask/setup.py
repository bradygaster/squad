from setuptools import setup, find_packages

setup(
    name="flask-api",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "Flask==3.1.3",
        "Flask-SQLAlchemy==3.0.0",
    ],
    extras_require={
        "dev": ["pytest==9.0.3", "black==26.3.1"],
    },
)
