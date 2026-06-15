from setuptools import setup, find_packages

setup(
    name="flask-api",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "Flask==2.3.0",
        "Flask-SQLAlchemy==3.0.0",
    ],
    extras_require={
        "dev": ["pytest==7.3.0", "black==26.3.1"],
    },
)
